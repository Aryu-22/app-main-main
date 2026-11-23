"""Delhi-only crime map analysis backed by the Delhi incident dataset."""

import math
from datetime import datetime
import json
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

BOUNDARY_PATH = (
    Path(__file__).resolve().parents[1]
    / "frontend"
    / "src"
    / "constants"
    / "delhiNctBoundary.json"
)
with BOUNDARY_PATH.open("r", encoding="utf-8") as boundary_file:
    DELHI_NCT_BOUNDARY = json.load(boundary_file)["coordinates"]

DELHI_BOUNDS = (
    min(point[0] for point in DELHI_NCT_BOUNDARY),
    max(point[0] for point in DELHI_NCT_BOUNDARY),
    min(point[1] for point in DELHI_NCT_BOUNDARY),
    max(point[1] for point in DELHI_NCT_BOUNDARY),
)
GRID_SIZE = 0.02
NEARBY_RADIUS_KM = 1.5
MIN_CELL_RECORDS = 20
MIN_PATTERN_RECORDS = 10
DELHI_TZ = ZoneInfo("Asia/Kolkata")
REQUIRED_COLUMNS = {
    "Latitude",
    "Longitude",
    "Area_Name",
    "Area_Type",
    "Date",
    "Hour",
    "Day_of_Week",
    "Primary_Crime_Type",
    "Crime_Count",
    "Risk_Score",
}


def is_within_delhi_nct(latitude, longitude):
    """Test a coordinate against the simplified OSM NCT boundary polygon."""
    south, north, west, east = DELHI_BOUNDS
    if (
        not math.isfinite(latitude)
        or not math.isfinite(longitude)
        or not south <= latitude <= north
        or not west <= longitude <= east
    ):
        return False

    inside = False
    for index, (current_latitude, current_longitude) in enumerate(
        DELHI_NCT_BOUNDARY
    ):
        previous_latitude, previous_longitude = DELHI_NCT_BOUNDARY[index - 1]
        cross = (
            (longitude - previous_longitude)
            * (current_latitude - previous_latitude)
            - (latitude - previous_latitude)
            * (current_longitude - previous_longitude)
        )
        if (
            abs(cross) <= 1e-10
            and min(previous_latitude, current_latitude) - 1e-10
            <= latitude
            <= max(previous_latitude, current_latitude) + 1e-10
            and min(previous_longitude, current_longitude) - 1e-10
            <= longitude
            <= max(previous_longitude, current_longitude) + 1e-10
        ):
            return True

        if (current_latitude > latitude) != (previous_latitude > latitude):
            crossing_longitude = (
                (previous_longitude - current_longitude)
                * (latitude - current_latitude)
                / (previous_latitude - current_latitude)
                + current_longitude
            )
            if longitude < crossing_longitude:
                inside = not inside
    return inside


def _polygon_mask(latitudes, longitudes):
    latitudes = np.asarray(latitudes, dtype=float)
    longitudes = np.asarray(longitudes, dtype=float)
    inside = np.zeros(latitudes.shape, dtype=bool)
    for index, (current_latitude, current_longitude) in enumerate(
        DELHI_NCT_BOUNDARY
    ):
        previous_latitude, previous_longitude = DELHI_NCT_BOUNDARY[index - 1]
        if current_latitude == previous_latitude:
            continue
        crosses = (current_latitude > latitudes) != (
            previous_latitude > latitudes
        )
        crossing_longitudes = (
            (previous_longitude - current_longitude)
            * (latitudes - current_latitude)
            / (previous_latitude - current_latitude)
            + current_longitude
        )
        inside ^= crosses & (longitudes < crossing_longitudes)
    return inside


def load_delhi_dataset(path):
    """Load and validate the source dataset; never substitute another city's data."""
    df = pd.read_csv(path)
    missing = REQUIRED_COLUMNS.difference(df.columns)
    if missing:
        raise ValueError(
            f"Delhi dataset is missing required columns: {', '.join(sorted(missing))}"
        )

    df["Date"] = pd.to_datetime(df["Date"], format="%d-%m-%Y", errors="coerce")
    for column in (
        "Latitude",
        "Longitude",
        "Hour",
        "Day_of_Week",
        "Crime_Count",
        "Risk_Score",
    ):
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.dropna(
        subset=[
            "Latitude",
            "Longitude",
            "Date",
            "Hour",
            "Day_of_Week",
            "Crime_Count",
            "Risk_Score",
            "Primary_Crime_Type",
        ]
    ).copy()
    south, north, west, east = DELHI_BOUNDS
    in_bbox = (
        df["Latitude"].between(south, north)
        & df["Longitude"].between(west, east)
        & df["Hour"].between(0, 23)
        & df["Day_of_Week"].between(0, 6)
    )
    df = df.loc[in_bbox].copy()
    df = df.loc[_polygon_mask(df["Latitude"], df["Longitude"])].copy()
    df["cell_lat"] = np.floor(df["Latitude"] / GRID_SIZE).astype(int)
    df["cell_lng"] = np.floor(df["Longitude"] / GRID_SIZE).astype(int)
    return df


def _zone_for_score(score, lower, upper):
    if score <= lower:
        return "Green"
    if score <= upper:
        return "Yellow"
    return "Red"


def delhi_grid_cells():
    """Return a clipped, regular grid over the configured Delhi NCT extent."""
    south, north, west, east = DELHI_BOUNDS
    for cell_lat in range(math.floor(south / GRID_SIZE), math.ceil(north / GRID_SIZE)):
        for cell_lng in range(
            math.floor(west / GRID_SIZE), math.ceil(east / GRID_SIZE)
        ):
            cell_south = max(cell_lat * GRID_SIZE, south)
            cell_north = min((cell_lat + 1) * GRID_SIZE, north)
            cell_west = max(cell_lng * GRID_SIZE, west)
            cell_east = min((cell_lng + 1) * GRID_SIZE, east)
            if cell_south >= cell_north or cell_west >= cell_east:
                continue
            center = (
                (cell_south + cell_north) / 2,
                (cell_west + cell_east) / 2,
            )
            if not is_within_delhi_nct(*center):
                continue
            yield {
                "cell_id": f"{cell_lat}:{cell_lng}",
                "center": center,
                "bounds": [[cell_south, cell_west], [cell_north, cell_east]],
            }


class DelhiCrimeAnalyzer:
    def __init__(self, dataframe):
        self.dataframe = dataframe
        self.grid = {}
        self.cell_metadata = {}
        self.interval_counts = {}
        self.area_cells = {}
        self.earliest_interval = None
        self.latest_interval = None
        self.lower_threshold = None
        self.upper_threshold = None
        if dataframe.empty:
            return

        if {"Date", "Hour", "Crime_Count"}.issubset(dataframe.columns):
            source = dataframe.copy()
            source["Interval"] = source["Date"] + pd.to_timedelta(
                source["Hour"], unit="h"
            )
            self.earliest_interval = source["Interval"].min()
            self.latest_interval = source["Interval"].max()
            cell_groups = source.groupby(["cell_lat", "cell_lng"], sort=True)
            for (cell_lat, cell_lng), group in cell_groups:
                cell_id = f"{int(cell_lat)}:{int(cell_lng)}"
                area_types = (
                    group["Area_Type"].mode()
                    if "Area_Type" in group
                    else pd.Series(dtype=str)
                )
                area_names = (
                    group["Area_Name"].mode()
                    if "Area_Name" in group
                    else pd.Series(dtype=str)
                )
                area_name = str(area_names.iloc[0]) if not area_names.empty else None
                self.cell_metadata[cell_id] = {
                    "latitude": (int(cell_lat) + 0.5) * GRID_SIZE,
                    "longitude": (int(cell_lng) + 0.5) * GRID_SIZE,
                    "area_type": (
                        str(area_types.iloc[0]) if not area_types.empty else "Unknown"
                    ),
                    "area_name": area_name,
                    "records": int(len(group)),
                }
                interval_counts = group.groupby("Interval")["Crime_Count"].sum()
                self.interval_counts[cell_id] = interval_counts
                if area_name:
                    self.area_cells.setdefault(area_name, []).append(cell_id)

        cells = dataframe.groupby(["cell_lat", "cell_lng"], as_index=False).agg(
            mean_risk_score=("Risk_Score", "mean"), records=("Risk_Score", "size")
        )
        self.lower_threshold = float(cells["mean_risk_score"].quantile(1 / 3))
        self.upper_threshold = float(cells["mean_risk_score"].quantile(2 / 3))
        for cell in cells.itertuples(index=False):
            self.grid[(int(cell.cell_lat), int(cell.cell_lng))] = {
                "mean_risk_score": float(cell.mean_risk_score),
                "records": int(cell.records),
                "safety_zone": _zone_for_score(
                    float(cell.mean_risk_score),
                    self.lower_threshold,
                    self.upper_threshold,
                ),
            }

    def zones(self):
        features = []
        south, north, west, east = DELHI_BOUNDS
        for (cell_lat, cell_lng), cell in self.grid.items():
            if cell["records"] < MIN_CELL_RECORDS:
                continue
            cell_south = max(cell_lat * GRID_SIZE, south)
            cell_north = min((cell_lat + 1) * GRID_SIZE, north)
            cell_west = max(cell_lng * GRID_SIZE, west)
            cell_east = min((cell_lng + 1) * GRID_SIZE, east)
            features.append(
                {
                    "bounds": [[cell_south, cell_west], [cell_north, cell_east]],
                    **cell,
                }
            )
        return {
            "status": "ok" if features else "insufficient_data",
            "zones": features,
            "score_source": "Delhi dataset Risk_Score",
            "thresholds": {
                "green_yellow": self.lower_threshold,
                "yellow_red": self.upper_threshold,
            },
            "data_period": self._data_period(),
        }

    def analyze(self, latitude, longitude, selected_at=None):
        if not all(math.isfinite(value) for value in (latitude, longitude)):
            raise ValueError("Coordinates must be finite numbers.")
        if not is_within_delhi_nct(latitude, longitude):
            raise ValueError("Location is outside the Delhi NCT map coverage.")

        selected_at = selected_at or datetime.now(DELHI_TZ)
        if selected_at.tzinfo is None:
            selected_at = selected_at.replace(tzinfo=DELHI_TZ)
        else:
            selected_at = selected_at.astimezone(DELHI_TZ)

        base = {
            "selected_location": {
                "area_name": "Insufficient Data",
                "latitude": round(latitude, 6),
                "longitude": round(longitude, 6),
            },
            "analyzed_at": selected_at.isoformat(),
            "safety_zone": "Insufficient Data",
            "crime_risk_level": "Insufficient Data",
            "risk_score": None,
            "crime_probability": {
                "status": "insufficient_data",
                "percentage": None,
                "message": (
                    "The dataset contains reported incidents but no exposure or non-crime "
                    "observations, so an occurrence probability cannot be calculated."
                ),
            },
            "most_likely_crime": None,
            "other_crime_categories": [],
            "time_context": {
                "timezone": "Asia/Kolkata",
                "date": selected_at.strftime("%d %b %Y"),
                "time": selected_at.strftime("%I:%M %p"),
                "period_used": (
                    f"{selected_at.hour:02d}:00-{selected_at.hour:02d}:59 "
                    "for the same weekday"
                ),
                "historical_period": self._data_period(),
                "records_used": 0,
                "pattern_basis": (
                    "Historical incident-category shares for the same hour and weekday; "
                    "these are not probabilities of a crime occurring."
                ),
            },
        }
        if self.dataframe.empty:
            return base

        cell = self.grid.get(
            (math.floor(latitude / GRID_SIZE), math.floor(longitude / GRID_SIZE))
        )
        if cell and cell["records"] >= MIN_CELL_RECORDS:
            base["safety_zone"] = cell["safety_zone"]
            base["crime_risk_level"] = {
                "Green": "Low",
                "Yellow": "Medium",
                "Red": "High",
            }[cell["safety_zone"]]
            base["risk_score"] = round(cell["mean_risk_score"], 1)

        df = self.dataframe
        lat_delta = (df["Latitude"].to_numpy() - latitude) * 111.0
        lng_delta = (
            (df["Longitude"].to_numpy() - longitude)
            * 111.0
            * math.cos(math.radians(latitude))
        )
        nearby_mask = np.hypot(lat_delta, lng_delta) <= NEARBY_RADIUS_KM
        nearby = df.loc[nearby_mask].copy()
        if nearby.empty:
            return base

        area_counts = nearby["Area_Name"].value_counts()
        base["selected_location"]["area_name"] = str(area_counts.index[0])

        event_intervals = nearby["Date"] + pd.to_timedelta(nearby["Hour"], unit="h")
        temporal = nearby[
            (nearby["Hour"] == selected_at.hour)
            & (nearby["Day_of_Week"] == selected_at.weekday())
            & (event_intervals < selected_at.replace(tzinfo=None))
        ]
        if len(temporal) < MIN_PATTERN_RECORDS:
            return base

        weights = temporal.groupby("Primary_Crime_Type")["Crime_Count"].sum()
        total_incidents = float(weights.sum())
        if total_incidents <= 0:
            return base

        categories = [
            {
                "category": str(category),
                "probability": round(float(count / total_incidents * 100), 1),
                "basis": "share of locally recorded incidents",
            }
            for category, count in weights.sort_values(ascending=False).items()
        ]
        base["most_likely_crime"] = categories[0]
        base["other_crime_categories"] = categories[1:]
        base["time_context"]["records_used"] = int(len(temporal))
        return base

    def _data_period(self):
        if self.dataframe.empty or "Date" not in self.dataframe:
            return None
        dates = self.dataframe["Date"]
        return f"{dates.min().date().isoformat()} to {dates.max().date().isoformat()}"
