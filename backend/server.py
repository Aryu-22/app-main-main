"""Delhi Crime Detection and Safety Intelligence API.
FastAPI backend serving Delhi crime analytics, heatmap points, police stations,
helplines, and live tracking endpoints.
"""
import logging
import math
import os
import uuid
from contextlib import asynccontextmanager
from datetime import date as Date, datetime, time as Time, timedelta, timezone
from pathlib import Path
from typing import List, Optional

import pandas as pd
from dotenv import load_dotenv
from fastapi import FastAPI, APIRouter, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.cors import CORSMiddleware

from delhi_data import HELPLINES, POLICE_STATIONS
from crime_analysis import (
    DELHI_TZ,
    DelhiCrimeAnalyzer,
    delhi_grid_cells,
    is_within_delhi_nct,
    load_delhi_dataset,
)
from crime_model import estimate_location_risk, load_model_artifacts

# ---------- Logging (must be configured before anything that calls logger) ----------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# ---------- Env ----------
ROOT_DIR = Path(__file__).resolve().parent.parent
for env_path in [ROOT_DIR / ".env", ROOT_DIR / "backend" / ".env"]:
    load_dotenv(env_path, override=False)

PREDICTION_MODE = os.getenv("PREDICTION_MODE", "research_demo").strip().lower()
if PREDICTION_MODE not in {"research_demo", "production"}:
    raise RuntimeError("PREDICTION_MODE must be 'research_demo' or 'production'.")
RESEARCH_DEMO_MODE = PREDICTION_MODE == "research_demo"


def get_env_list(name: str, default: List[str]) -> List[str]:
    raw_value = os.getenv(name)
    if not raw_value:
        return default
    parsed = [item.strip() for item in raw_value.split(",") if item.strip()]
    return parsed or default


# ---------- Mongo ----------
mongo_url = os.getenv("MONGO_URL")
db_name = os.getenv("DB_NAME", "lucknow_safety")
_mongo_client: Optional[AsyncIOMotorClient] = None
db = None


async def db_status():
    if db is None:
        return {"status": "degraded", "database": "not_configured"}
    try:
        await db.command("ping")
        return {"status": "ok", "database": "connected"}
    except Exception as exc:  # pragma: no cover - defensive guard
        return {"status": "degraded", "database": "unavailable", "error": str(exc)}


# ---------- Lifespan (replaces deprecated @app.on_event) ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global _mongo_client, db
    if mongo_url:
        _mongo_client = AsyncIOMotorClient(mongo_url)
        db = _mongo_client[db_name]
        logger.info("MongoDB client initialised for db '%s'.", db_name)
    else:
        logger.info("MONGO_URL not set — running without MongoDB persistence.")

    yield  # App runs here

    # Shutdown
    if _mongo_client is not None:
        _mongo_client.close()
        logger.info("MongoDB client closed.")


# ---------- FastAPI app ----------
app = FastAPI(title="Delhi Crime Detection", lifespan=lifespan)

# ---------- CORS (registered before routes) ----------
default_cors_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
cors_origins = get_env_list("CORS_ORIGINS", default_cors_origins)
if cors_origins == ["*"]:
    cors_origins = default_cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Router ----------
api_router = APIRouter(prefix="/api")

# ---------- Load crime dataset once at startup ----------
DELHI_ANALYZER: Optional[DelhiCrimeAnalyzer] = None
DELHI_MODEL = None
DELHI_MODEL_LOADED = False
DELHI_ZONE_CACHE = {}


def resolve_delhi_data_path() -> Path:
    candidates = []
    env_value = os.getenv("DELHI_CRIME_DATA_PATH")
    if env_value:
        candidates.append(Path(env_value))
    candidates.extend([
        ROOT_DIR / "data" / "Delhi_dataset.csv",
        ROOT_DIR / "backend" / "data" / "Delhi_dataset.csv",
    ])
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0] if candidates else ROOT_DIR / "data" / "Delhi_dataset.csv"


def get_delhi_analyzer() -> DelhiCrimeAnalyzer:
    global DELHI_ANALYZER
    if DELHI_ANALYZER is None:
        delhi_path = resolve_delhi_data_path()
        if not delhi_path.exists():
            logger.warning("Delhi crime dataset not found at '%s'.", delhi_path)
            DELHI_ANALYZER = DelhiCrimeAnalyzer(pd.DataFrame())
        else:
            DELHI_ANALYZER = DelhiCrimeAnalyzer(load_delhi_dataset(delhi_path))
            logger.info(
                "Loaded %d Delhi records from '%s'.",
                len(DELHI_ANALYZER.dataframe),
                delhi_path,
            )
    return DELHI_ANALYZER


def get_delhi_model():
    global DELHI_MODEL, DELHI_MODEL_LOADED
    if not DELHI_MODEL_LOADED:
        artifact_dir = Path(
            os.getenv("DELHI_MODEL_ARTIFACT_DIR", ROOT_DIR / "backend" / "artifacts")
        )
        DELHI_MODEL = load_model_artifacts(artifact_dir)
        DELHI_MODEL_LOADED = True
        if DELHI_MODEL is None:
            logger.warning("Delhi crime model artifacts not found in '%s'.", artifact_dir)
    return DELHI_MODEL


def load_crime_data() -> pd.DataFrame:
    return get_delhi_analyzer().dataframe


# Precomputed at startup
load_crime_data()

# ---------- Helpers ----------
def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(a))


# ---------- Models ----------
class TrackingPointIn(BaseModel):
    session_id: str
    lat: float
    lng: float
    accuracy: Optional[float] = None
    source: Optional[str] = "real"  # real | simulated


class TrackingPoint(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str
    lat: float
    lng: float
    accuracy: Optional[float] = None
    source: str = "real"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SOSEventIn(BaseModel):
    session_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    kind: str  # "sos" | "helpline_called"
    detail: Optional[str] = None


class RouteRiskSample(BaseModel):
    segment_id: str = Field(min_length=1, max_length=64)
    latitude: float = Field(allow_inf_nan=False)
    longitude: float = Field(allow_inf_nan=False)
    minutes_from_departure: float = Field(ge=0, le=1440, allow_inf_nan=False)
    duration_minutes: float = Field(gt=0, le=60, allow_inf_nan=False)


class RouteRiskRequest(BaseModel):
    departure_at: datetime
    segments: List[RouteRiskSample] = Field(min_length=1, max_length=200)


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"app": "Delhi Crime Detection", "status": "ok"}


@api_router.get("/health")
async def health_check():
    return await db_status()


@api_router.get("/summary")
async def summary():
    df = load_crime_data()
    total = int(df["Crime_Count"].sum()) if not df.empty else 0
    return {
        "records": int(len(df)),
        "total_reported_incidents": total,
        "stations": len(POLICE_STATIONS),
        "helplines": len(HELPLINES),
        "coverage": "Delhi NCT",
        "date_range": {
            "start": str(df["Date"].min().date()) if not df.empty else None,
            "end": str(df["Date"].max().date()) if not df.empty else None,
        },
        "primary_crime_types": sorted(df["Primary_Crime_Type"].dropna().unique().tolist()) if not df.empty else [],
    }


@api_router.get("/crime/heatmap")
async def crime_heatmap(
    limit: int = Query(2500, ge=100, le=10000),
    crime_type: Optional[str] = None,
    hour: Optional[int] = Query(None, ge=0, le=23),
    weekend_only: bool = False,
):
    df = load_crime_data()
    if df.empty:
        return {"points": [], "count": 0}
    if crime_type and crime_type != "All":
        df = df[df["Primary_Crime_Type"] == crime_type]
    if hour is not None:
        df = df[df["Hour"] == hour]
    if weekend_only:
        df = df[df["Is_Weekend"] == 1]

    if len(df) > limit:
        df = df.sample(n=limit, random_state=42)

    max_intensity = float(df["Crime_Count"].max()) if not df.empty else 1.0
    points = [
        [float(row.Latitude), float(row.Longitude), float(row.Crime_Count) / max_intensity]
        for row in df.itertuples()
    ]
    return {"points": points, "count": len(points), "max_intensity": max_intensity}


@api_router.get("/crime/zones")
async def crime_zones(at: Optional[datetime] = None):
    analyzer = get_delhi_analyzer()
    if not RESEARCH_DEMO_MODE:
        return analyzer.zones()

    selected_at = at or datetime.now(DELHI_TZ)
    if selected_at.tzinfo is None:
        selected_at = selected_at.replace(tzinfo=DELHI_TZ)
    else:
        selected_at = selected_at.astimezone(DELHI_TZ)
    selected_at = selected_at.replace(minute=0, second=0, microsecond=0)
    cache_key = selected_at.isoformat()
    cached = DELHI_ZONE_CACHE.get(cache_key)
    if cached is not None:
        return cached

    model = get_delhi_model()
    zones = []
    estimated_cells = 0
    for cell in delhi_grid_cells():
        latitude, longitude = cell["center"]
        prediction = estimate_location_risk(
            model,
            analyzer,
            latitude,
            longitude,
            selected_at,
            research_demo=True,
            include_categories=False,
        )
        estimated = prediction["crime_probability"]["status"] == "ok"
        estimated_cells += int(estimated)
        zones.append(
            {
                "cell_id": cell["cell_id"],
                "bounds": cell["bounds"],
                "safety_zone": (
                    prediction["safety_zone"] if estimated else "Unknown"
                ),
                "crime_probability": prediction["crime_probability"],
                "prediction_source": prediction["prediction_source"],
                "estimate_type": prediction["estimate_type"],
                "estimate_label": prediction["estimate_label"],
            }
        )
    result = {
        "status": "ok" if estimated_cells else "insufficient_data",
        "prediction_mode": PREDICTION_MODE,
        "generated_at": selected_at.isoformat(),
        "grid_cell_count": len(zones),
        "estimated_cell_count": estimated_cells,
        "unknown_cell_count": len(zones) - estimated_cells,
        "zones": zones,
        "score_source": "experimental XGBoost and distance-weighted research estimates",
        "synthetic_dataset": True,
    }
    if len(DELHI_ZONE_CACHE) >= 4:
        DELHI_ZONE_CACHE.clear()
    DELHI_ZONE_CACHE[cache_key] = result
    return result


@api_router.post("/crime/route-risk")
async def crime_route_risk(payload: RouteRiskRequest):
    for segment in payload.segments:
        if not is_within_delhi_nct(segment.latitude, segment.longitude):
            raise HTTPException(
                status_code=422,
                detail="Every route segment must be within the NCT of Delhi.",
            )

    departure_at = payload.departure_at
    if departure_at.tzinfo is None:
        departure_at = departure_at.replace(tzinfo=DELHI_TZ)
    else:
        departure_at = departure_at.astimezone(DELHI_TZ)
    analyzer = get_delhi_analyzer()
    model = get_delhi_model()
    segment_results = []
    for segment in payload.segments:
        arrival_at = departure_at + timedelta(
            minutes=segment.minutes_from_departure
        )
        prediction = estimate_location_risk(
            model,
            analyzer,
            segment.latitude,
            segment.longitude,
            arrival_at,
            research_demo=RESEARCH_DEMO_MODE,
        )
        known = prediction["crime_probability"]["status"] == "ok"
        segment_results.append(
            {
                "segment_id": segment.segment_id,
                "arrival_time": arrival_at.isoformat(),
                "duration_minutes": segment.duration_minutes,
                "crime_probability": prediction["crime_probability"],
                "risk_level": (
                    prediction["crime_risk_level"]
                    if known
                    else "Unknown / Insufficient Data"
                ),
                "safety_zone": prediction["safety_zone"] if known else "Unknown",
                "coverage": prediction["coverage"],
                "prediction_source": prediction["prediction_source"],
                "fallback_used": prediction["fallback_used"],
                "estimate_type": prediction["estimate_type"],
                "estimate_label": prediction["estimate_label"],
                "most_likely_crime": prediction["most_likely_crime"],
                "other_crime_categories": prediction["other_crime_categories"],
            }
        )

    covered_segments = sum(
        segment["crime_probability"]["status"] == "ok"
        for segment in segment_results
    )
    return {
        "status": "ok",
        "synthetic_dataset": True,
        "prediction_mode": PREDICTION_MODE,
        "departure_time": departure_at.isoformat(),
        "covered_segments": covered_segments,
        "insufficient_segments": len(segment_results) - covered_segments,
        "risk_probability_thresholds": (
            list(model["risk_probability_thresholds"])
            if model and model.get("deployment_ready")
            else None
        ),
        "zero_interval_semantics": (
            "A zero means no record appeared in the synthetic interval; it does not "
            "mean the location was verified crime-free."
        ),
        "segments": segment_results,
    }


async def _analyze_delhi_location(lat: float, lng: float, at: Optional[datetime] = None):
    try:
        selected_at = at or datetime.now(DELHI_TZ)
        if selected_at.tzinfo is None:
            selected_at = selected_at.replace(tzinfo=DELHI_TZ)
        else:
            selected_at = selected_at.astimezone(DELHI_TZ)
        analyzer = get_delhi_analyzer()
        result = analyzer.analyze(lat, lng, selected_at)
        model_result = estimate_location_risk(
            get_delhi_model(),
            analyzer,
            lat,
            lng,
            selected_at,
            research_demo=RESEARCH_DEMO_MODE,
        )
        result["crime_probability"] = model_result["crime_probability"]
        result["crime_risk_level"] = model_result["crime_risk_level"]
        result["safety_zone"] = model_result["safety_zone"]
        result["data_coverage"] = model_result["coverage"]
        result["model_validation"] = model_result["validation"]
        result["prediction_source"] = model_result["prediction_source"]
        result["fallback_used"] = model_result["fallback_used"]
        result["fallback_status"] = model_result["fallback_status"]
        result["estimate_type"] = model_result["estimate_type"]
        result["estimate_label"] = model_result["estimate_label"]
        result["prediction_mode"] = model_result.get(
            "prediction_mode", PREDICTION_MODE
        )
        result["category_source"] = model_result.get("category_source")
        result["category_records"] = model_result.get("category_records", 0)
        if model_result["coverage"].get("locality") and (
            result["selected_location"]["area_name"] == "Insufficient Data"
        ):
            result["selected_location"]["area_name"] = model_result["coverage"][
                "locality"
            ]
        result["most_likely_crime"] = model_result["most_likely_crime"]
        result["other_crime_categories"] = model_result["other_crime_categories"]
        result["time_context"]["records_used"] = model_result["category_records"]
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.get("/crime/location-analysis")
async def crime_location_analysis(
    lat: float,
    lng: float,
    at: Optional[datetime] = None,
):
    return await _analyze_delhi_location(lat, lng, at)


@api_router.get("/crime/predict")
async def crime_predict(
    latitude: float,
    longitude: float,
    date: Date,
    time: Time,
):
    return await _analyze_delhi_location(
        latitude, longitude, datetime.combine(date, time)
    )


@api_router.get("/crime/nearby")
async def crime_nearby(
    lat: float,
    lng: float,
    radius_km: float = Query(2.0, ge=0.1, le=20.0),
):
    prediction = await _analyze_delhi_location(lat, lng)
    df = load_crime_data()
    sub = df.iloc[0:0].copy()
    if not df.empty:
        dlat = radius_km / 111.0
        dlng = radius_km / (111.0 * max(math.cos(math.radians(lat)), 0.1))
        sub = df[
            (df["Latitude"].between(lat - dlat, lat + dlat))
            & (df["Longitude"].between(lng - dlng, lng + dlng))
        ].copy()
        if not sub.empty:
            sub["dist_km"] = sub.apply(
                lambda row: haversine_km(lat, lng, row.Latitude, row.Longitude),
                axis=1,
            )
            sub = sub[sub["dist_km"] <= radius_km]

    incidents = int(sub["Crime_Count"].sum()) if not sub.empty else 0
    top_crimes = (
        sub.groupby("Primary_Crime_Type")["Crime_Count"]
        .sum()
        .sort_values(ascending=False)
        .head(5)
        .to_dict()
        if not sub.empty
        else {}
    )
    sample_columns = [
        "Latitude", "Longitude", "Primary_Crime_Type", "Secondary_Crime_Type",
        "Hour", "Area_Type", "Crime_Count", "dist_km",
    ]
    sample = (
        sub.nlargest(15, "Crime_Count")[sample_columns].to_dict(orient="records")
        if not sub.empty
        else []
    )
    probability = prediction["crime_probability"]
    return {
        "radius_km": radius_km,
        "incidents": incidents,
        "risk_score": probability.get("percentage"),
        "risk_level": prediction["crime_risk_level"],
        "safety_zone": prediction["safety_zone"],
        "crime_probability": probability,
        "data_coverage": prediction["data_coverage"],
        "prediction_source": prediction["prediction_source"],
        "fallback_used": prediction["fallback_used"],
        "most_likely_crime": prediction["most_likely_crime"],
        "top_crimes": [{"type": key, "count": int(value)} for key, value in top_crimes.items()],
        "sample": sample,
        "synthetic_dataset": True,
    }


@api_router.get("/crime/analytics")
async def crime_analytics():
    df = load_crime_data()
    if df.empty:
        return {"by_type": [], "by_hour": [], "by_day": [], "by_area": [], "weekend_split": [], "monthly": []}
    by_type = (
        df.groupby("Primary_Crime_Type")["Crime_Count"].sum().sort_values(ascending=False)
        .reset_index().rename(columns={"Primary_Crime_Type": "type", "Crime_Count": "count"})
        .to_dict(orient="records")
    )
    by_hour = (
        df.groupby("Hour")["Crime_Count"].sum().reset_index()
        .rename(columns={"Hour": "hour", "Crime_Count": "count"})
        .to_dict(orient="records")
    )
    day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    by_day_raw = df.groupby("Day_of_Week")["Crime_Count"].sum().to_dict()
    by_day = [{"day": day_names[i], "count": int(by_day_raw.get(i, 0))} for i in range(7)]
    by_area = (
        df.groupby("Area_Type")["Crime_Count"].sum().sort_values(ascending=False)
        .reset_index().rename(columns={"Area_Type": "area", "Crime_Count": "count"})
        .to_dict(orient="records")
    )
    weekend_totals = df.groupby("Is_Weekend")["Crime_Count"].sum().to_dict()
    weekend_split = [
        {"label": "Weekday", "count": int(weekend_totals.get(0, 0))},
        {"label": "Weekend", "count": int(weekend_totals.get(1, 0))},
    ]
    monthly = (
        df.groupby("Month")["Crime_Count"].sum().reset_index()
        .rename(columns={"Month": "month", "Crime_Count": "count"})
        .to_dict(orient="records")
    )
    return {
        "by_type": by_type,
        "by_hour": by_hour,
        "by_day": by_day,
        "by_area": by_area,
        "weekend_split": weekend_split,
        "monthly": monthly,
    }


@api_router.get("/stations")
async def list_stations(lat: Optional[float] = None, lng: Optional[float] = None):
    stations = [dict(s) for s in POLICE_STATIONS]
    if lat is not None and lng is not None:
        for s in stations:
            s["distance_km"] = round(haversine_km(lat, lng, s["lat"], s["lng"]), 2)
        stations.sort(key=lambda s: s["distance_km"])
    return {"stations": stations}


@api_router.get("/stations/nearest")
async def nearest_station(lat: float, lng: float):
    nearest = min(
        POLICE_STATIONS,
        key=lambda s: haversine_km(lat, lng, s["lat"], s["lng"]),
    )
    result = dict(nearest)
    result["distance_km"] = round(haversine_km(lat, lng, nearest["lat"], nearest["lng"]), 2)
    return result


@api_router.get("/helplines")
async def list_helplines():
    return {"helplines": HELPLINES}


@api_router.post("/tracking/point", response_model=TrackingPoint)
async def add_tracking_point(payload: TrackingPointIn):
    point = TrackingPoint(**payload.model_dump())
    if db is None:
        return point
    doc = point.model_dump()
    doc["timestamp"] = doc["timestamp"].isoformat()
    try:
        await db.tracking_points.insert_one(doc)
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning("Tracking point persistence unavailable: %s", exc)
    return point


@api_router.get("/tracking/session/{session_id}")
async def get_session(session_id: str, limit: int = 500):
    if db is None:
        return {"session_id": session_id, "count": 0, "points": []}
    try:
        cursor = db.tracking_points.find({"session_id": session_id}, {"_id": 0}).sort("timestamp", 1).limit(limit)
        points = await cursor.to_list(length=limit)
        return {"session_id": session_id, "count": len(points), "points": points}
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning("Tracking session query failed: %s", exc)
        return {"session_id": session_id, "count": 0, "points": []}


@api_router.post("/sos")
async def sos_event(payload: SOSEventIn):
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["timestamp"] = datetime.now(timezone.utc).isoformat()
    if db is None:
        return {"status": "queued", "id": doc["id"], "timestamp": doc["timestamp"], "database": "not_configured"}
    try:
        await db.sos_events.insert_one(doc)
        return {"status": "logged", "id": doc["id"], "timestamp": doc["timestamp"]}
    except Exception as exc:  # pragma: no cover - defensive guard
        logger.warning("SOS persistence failed: %s", exc)
        return {"status": "queued", "id": doc["id"], "timestamp": doc["timestamp"], "database": "unavailable"}


# Mount router
app.include_router(api_router)
