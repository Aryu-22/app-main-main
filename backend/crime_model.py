"""Inference helpers for the experimental Delhi recorded-crime model."""

import json
import math
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

try:
    from .crime_analysis import GRID_SIZE, NEARBY_RADIUS_KM, is_within_delhi_nct
except ImportError:
    from crime_analysis import GRID_SIZE, NEARBY_RADIUS_KM, is_within_delhi_nct

NUMERIC_FEATURES = [
    "Latitude",
    "Longitude",
    "Hour",
    "DayOfWeek",
    "Month",
    "HourSin",
    "HourCos",
    "WeekdaySin",
    "WeekdayCos",
    "MonthSin",
    "MonthCos",
    "IsWeekend",
    "HistoricalCount7D",
    "HistoricalCountTotal",
    "HistoricalSameHour4W",
]
CATEGORICAL_FEATURES = ["Cell_ID", "Area_Type"]
MIN_MODEL_CELL_RECORDS = 20
MIN_SIMILAR_HOUR_CELL_RECORDS = 10
MIN_ADAPTIVE_CELLS = 2
MIN_ADAPTIVE_RECORDS = 50
ADAPTIVE_GRID_SIZES = (0.04, 0.08)
NEARBY_RADII_KM = (5.0, 10.0, 15.0)
MIN_STATISTICAL_CELL_RECORDS = 5
MAX_STATISTICAL_DISTANCE_KM = 15.0
STATISTICAL_NEIGHBOR_COUNT = 5
MIN_CATEGORY_RECORDS = 10


def load_model_artifacts(artifact_dir):
    artifact_dir = Path(artifact_dir)
    model_path = artifact_dir / "delhi_crime_model.joblib"
    preprocessing_path = artifact_dir / "delhi_preprocessing_pipeline.joblib"
    metrics_path = artifact_dir / "delhi_model_metrics.json"
    if not all(
        path.exists() for path in (model_path, preprocessing_path, metrics_path)
    ):
        return None

    bundle = joblib.load(model_path)
    bundle["preprocessing_pipeline"] = joblib.load(preprocessing_path)
    with metrics_path.open("r", encoding="utf-8") as metrics_file:
        bundle["evaluation_metrics"] = json.load(metrics_file)
    return bundle


def _unavailable(message, coverage=None, metrics=None):
    return {
        "crime_probability": {
            "status": "insufficient_data",
            "percentage": None,
            "message": message,
        },
        "crime_risk_level": "Insufficient Data",
        "safety_zone": "Insufficient Data",
        "coverage": coverage or {"status": "insufficient_data"},
        "validation": metrics,
        "most_likely_crime": None,
        "other_crime_categories": [],
        "prediction_source": "insufficient_data",
        "fallback_used": False,
        "fallback_status": "insufficient_data",
        "estimate_type": "unavailable",
        "estimate_label": "Insufficient Data",
    }


def temporal_features(timestamp):
    hour = int(timestamp.hour)
    weekday = int(timestamp.dayofweek)
    month = int(timestamp.month)
    return {
        "Hour": hour,
        "DayOfWeek": weekday,
        "Month": month,
        "HourSin": math.sin(2 * math.pi * hour / 24),
        "HourCos": math.cos(2 * math.pi * hour / 24),
        "WeekdaySin": math.sin(2 * math.pi * weekday / 7),
        "WeekdayCos": math.cos(2 * math.pi * weekday / 7),
        "MonthSin": math.sin(2 * math.pi * (month - 1) / 12),
        "MonthCos": math.cos(2 * math.pi * (month - 1) / 12),
        "IsWeekend": int(weekday >= 5),
    }


def _historical_reference(analyzer, target_time):
    if analyzer.earliest_interval is None or analyzer.latest_interval is None:
        return None, "no_history"
    if target_time > analyzer.latest_interval:
        reference = target_time - pd.DateOffset(years=1)
        if reference > analyzer.latest_interval:
            reference = analyzer.latest_interval.floor("h") + pd.Timedelta(hours=1)
        return reference, "future_seasonal_pattern"
    if target_time < analyzer.earliest_interval:
        return analyzer.earliest_interval.floor("h"), "prehistory_pattern"
    return target_time, "observed_period"


def _cell_features(analyzer, cell_id, target_time, reference_time):
    cell = analyzer.cell_metadata[cell_id]
    history = analyzer.interval_counts[cell_id]
    before = history.loc[history.index < reference_time]
    historical_7d = float(
        before.loc[before.index >= reference_time - pd.Timedelta(hours=168)].sum()
    )
    historical_total = float(before.sum())
    same_hour_4w = sum(
        float(history.get(reference_time - pd.Timedelta(days=days_ago), 0))
        for days_ago in (7, 14, 21, 28)
    )
    return {
        "Latitude": cell["latitude"],
        "Longitude": cell["longitude"],
        **temporal_features(target_time),
        "HistoricalCount7D": historical_7d,
        "HistoricalCountTotal": historical_total,
        "HistoricalSameHour4W": same_hour_4w,
        "Cell_ID": cell_id,
        "Area_Type": cell["area_type"],
    }


def _predict_probability(bundle, features):
    raw = bundle["pipeline"].predict_proba(features)[:, 1]
    clipped = np.clip(raw, 1e-6, 1 - 1e-6)
    logits = np.log(clipped / (1 - clipped)).reshape(-1, 1)
    return bundle["calibrator"].predict_proba(logits)[:, 1]


def _distance_km(latitude, longitude, cell):
    lat_km = (cell["latitude"] - latitude) * 111.0
    lng_km = (cell["longitude"] - longitude) * 111.0 * math.cos(math.radians(latitude))
    return math.hypot(lat_km, lng_km)


def _nearest_area(analyzer, latitude, longitude, max_distance_km=8.0):
    candidates = []
    for cell_id, cell in analyzer.cell_metadata.items():
        if not cell.get("area_name"):
            continue
        distance = _distance_km(latitude, longitude, cell)
        if distance <= max_distance_km:
            candidates.append((distance, cell["records"], cell["area_name"]))
    if not candidates:
        return None
    candidates.sort(key=lambda item: (item[0], -item[1]))
    return candidates[0][2]


def _category_patterns(
    analyzer,
    latitude,
    longitude,
    target_time,
    reference_time,
    area_name,
    temporal_source,
):
    events = analyzer.dataframe
    event_intervals = events["Date"] + pd.to_timedelta(events["Hour"], unit="h")
    cutoff = (
        analyzer.latest_interval + pd.Timedelta(hours=1)
        if temporal_source == "prehistory_pattern"
        else reference_time
    )
    events = events.loc[event_intervals < cutoff]
    if events.empty:
        return None, [], None, 0

    lat_delta = (events["Latitude"].to_numpy() - latitude) * 111.0
    lng_delta = (
        (events["Longitude"].to_numpy() - longitude)
        * 111.0
        * math.cos(math.radians(latitude))
    )
    distances = np.hypot(lat_delta, lng_delta)
    local_time = None
    source = None
    for radius in (NEARBY_RADIUS_KM, 5.0, 15.0, 30.0):
        nearby = events.loc[distances <= radius]
        time_matched = nearby[
            (nearby["Hour"] == target_time.hour)
            & (nearby["Day_of_Week"] == target_time.dayofweek)
        ]
        if len(time_matched) >= MIN_CATEGORY_RECORDS:
            local_time = time_matched
            source = f"nearby_{int(radius)}km_hour_weekday"
            break
        same_hour = nearby[nearby["Hour"] == target_time.hour]
        if len(same_hour) >= MIN_CATEGORY_RECORDS:
            local_time = same_hour
            source = f"nearby_{int(radius)}km_same_hour"
            break

    if local_time is None and area_name:
        area_events = events[events["Area_Name"] == area_name]
        time_matched = area_events[
            (area_events["Hour"] == target_time.hour)
            & (area_events["Day_of_Week"] == target_time.dayofweek)
        ]
        if len(time_matched) >= MIN_CATEGORY_RECORDS:
            local_time = time_matched
            source = "locality_hour_weekday"
        else:
            same_hour = area_events[area_events["Hour"] == target_time.hour]
            if len(same_hour) >= MIN_CATEGORY_RECORDS:
                local_time = same_hour
                source = "locality_same_hour"

    if local_time is None:
        return None, [], None, 0

    counts = local_time.groupby("Primary_Crime_Type")["Crime_Count"].sum()
    total = float(counts.sum())
    if total <= 0:
        return None, [], None, 0
    categories = [
        {
            "category": str(category),
            "probability": round(float(count / total * 100), 1),
            "basis": "share of synthetic recorded incidents, not an occurrence probability",
        }
        for category, count in counts.sort_values(ascending=False).items()
    ]
    return categories[0], categories[1:], source, int(len(local_time))


def estimate_location_risk(
    bundle,
    analyzer,
    latitude,
    longitude,
    selected_at,
    research_demo=False,
    include_categories=True,
):
    if not is_within_delhi_nct(latitude, longitude):
        raise ValueError("Location is outside the Delhi NCT map coverage.")

    metrics = bundle.get("evaluation_metrics") if bundle else None
    if not bundle:
        return _unavailable(
            "The experimental model has not been trained or its artifacts are unavailable."
        )
    if not bundle.get("deployment_ready"):
        return _unavailable(
            "The trained models did not meet the configured chronological validation criteria.",
            {"status": "insufficient_data"},
            metrics,
        )

    target_time = pd.Timestamp(selected_at.replace(tzinfo=None)).floor("h")
    reference_time, temporal_source = _historical_reference(analyzer, target_time)
    if reference_time is None:
        return _unavailable(
            "Historical location-time coverage is unavailable.", metrics=metrics
        )

    exact_id = f"{math.floor(latitude / GRID_SIZE)}:{math.floor(longitude / GRID_SIZE)}"
    exact_cell = analyzer.cell_metadata.get(exact_id)
    probabilities = []
    source = None
    estimate_type = None
    merge_level = None
    merged_cells = 0
    max_distance = 0.0
    statistical_details = None
    model_cell = (
        exact_cell is not None and exact_cell["records"] >= MIN_MODEL_CELL_RECORDS
    )
    if model_cell:
        features = pd.DataFrame(
            [_cell_features(analyzer, exact_id, target_time, reference_time)],
            columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES,
        )
        probabilities = [float(_predict_probability(bundle, features)[0])]
        source = "exact_grid_cell_selected_hour"
        estimate_type = "model_based"
        merged_cells = 1
    elif (
        research_demo
        and exact_cell is not None
        and exact_cell["records"] >= MIN_STATISTICAL_CELL_RECORDS
    ):
        features = pd.DataFrame(
            [_cell_features(analyzer, exact_id, target_time, reference_time)],
            columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES,
        )
        probabilities = [float(_predict_probability(bundle, features)[0])]
        source = "sparse_exact_cell_model"
        estimate_type = "nearby_data"
        merged_cells = 1

    def supported_cells(candidate_ids):
        return [
            cell_id
            for cell_id in candidate_ids
            if analyzer.cell_metadata[cell_id]["records"] >= MIN_MODEL_CELL_RECORDS
        ]

    def pool_cell_probabilities(cell_ids, distance_power=1):
        feature_rows = [
            _cell_features(analyzer, cell_id, target_time, reference_time)
            for cell_id in cell_ids
        ]
        features = pd.DataFrame(
            feature_rows, columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES
        )
        cell_probabilities = _predict_probability(bundle, features)
        distances = [
            _distance_km(latitude, longitude, analyzer.cell_metadata[cell_id])
            for cell_id in cell_ids
        ]
        weights = [
            math.sqrt(analyzer.cell_metadata[cell_id]["records"])
            / (1 + distance) ** distance_power
            for cell_id, distance in zip(cell_ids, distances)
        ]
        return (
            float(np.average(cell_probabilities, weights=weights)),
            max(distances, default=0.0),
        )

    if source is None:
        for grid_size in ADAPTIVE_GRID_SIZES:
            parent = (
                math.floor(latitude / grid_size),
                math.floor(longitude / grid_size),
            )
            candidates = supported_cells(
                [
                    cell_id
                    for cell_id, cell in analyzer.cell_metadata.items()
                    if (
                        math.floor(cell["latitude"] / grid_size),
                        math.floor(cell["longitude"] / grid_size),
                    )
                    == parent
                ]
            )
            total_records = sum(
                analyzer.cell_metadata[cell_id]["records"] for cell_id in candidates
            )
            if (
                len(candidates) >= MIN_ADAPTIVE_CELLS
                and total_records >= MIN_ADAPTIVE_RECORDS
            ):
                probability, max_distance = pool_cell_probabilities(candidates)
                probabilities = [probability]
                source = f"adaptive_grid_{grid_size:.2f}_selected_hour"
                estimate_type = "nearby_data"
                merge_level = grid_size
                merged_cells = len(candidates)
                break

    if source is None:
        for radius in NEARBY_RADII_KM:
            candidates = supported_cells(
                [
                    cell_id
                    for cell_id, cell in analyzer.cell_metadata.items()
                    if _distance_km(latitude, longitude, cell) <= radius
                ]
            )
            total_records = sum(
                analyzer.cell_metadata[cell_id]["records"] for cell_id in candidates
            )
            if (
                len(candidates) >= MIN_ADAPTIVE_CELLS
                and total_records >= MIN_ADAPTIVE_RECORDS
            ):
                probability, max_distance = pool_cell_probabilities(candidates)
                probabilities = [probability]
                source = f"nearby_supported_cells_{int(radius)}km_selected_hour"
                estimate_type = "nearby_data"
                merged_cells = len(candidates)
                break

    if (
        source is None
        and exact_cell
        and exact_cell["records"] >= MIN_SIMILAR_HOUR_CELL_RECORDS
    ):
        offsets = (-2, -1, 0, 1, 2)
        feature_rows = [
            _cell_features(
                analyzer,
                exact_id,
                target_time + pd.Timedelta(hours=offset),
                reference_time + pd.Timedelta(hours=offset),
            )
            for offset in offsets
        ]
        features = pd.DataFrame(
            feature_rows, columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES
        )
        hourly_probabilities = _predict_probability(bundle, features)
        weights = np.asarray([0.45, 0.75, 1.0, 0.75, 0.45])
        probabilities = [float(np.average(hourly_probabilities, weights=weights))]
        source = "same_cell_similar_hours"
        estimate_type = "nearby_data"
        merged_cells = 1

    area_name = (
        (exact_cell.get("area_name") if exact_cell else None)
        or _nearest_area(
            analyzer,
            latitude,
            longitude,
            max_distance_km=MAX_STATISTICAL_DISTANCE_KM,
        )
    )
    if source is None and research_demo and area_name:
        locality_candidates = sorted(
            (
                _distance_km(latitude, longitude, analyzer.cell_metadata[cell_id]),
                cell_id,
            )
            for cell_id in analyzer.area_cells.get(area_name, [])
            if analyzer.cell_metadata[cell_id]["records"]
            >= MIN_STATISTICAL_CELL_RECORDS
        )
        locality_candidates = [
            item
            for item in locality_candidates
            if item[0] <= MAX_STATISTICAL_DISTANCE_KM
        ][:STATISTICAL_NEIGHBOR_COUNT]
        if locality_candidates:
            cell_ids = [cell_id for _, cell_id in locality_candidates]
            probability, max_distance = pool_cell_probabilities(
                cell_ids, distance_power=2
            )
            probabilities = [probability]
            source = "locality_weighted_supported_model_cells"
            estimate_type = "nearby_data"
            merged_cells = len(cell_ids)

    if source is None and research_demo:
        candidates = sorted(
            (
                _distance_km(latitude, longitude, cell),
                cell_id,
            )
            for cell_id, cell in analyzer.cell_metadata.items()
            if cell["records"] >= MIN_STATISTICAL_CELL_RECORDS
        )
        candidates = [
            item
            for item in candidates
            if item[0] <= MAX_STATISTICAL_DISTANCE_KM
        ][:STATISTICAL_NEIGHBOR_COUNT]
        if candidates:
            cell_ids = [cell_id for _, cell_id in candidates]
            feature_rows = [
                _cell_features(analyzer, cell_id, target_time, reference_time)
                for cell_id in cell_ids
            ]
            features = pd.DataFrame(
                feature_rows, columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES
            )
            distances = np.asarray([distance for distance, _ in candidates])
            records = np.asarray(
                [
                    analyzer.cell_metadata[cell_id]["records"]
                    for cell_id in cell_ids
                ],
                dtype=float,
            )
            weights = np.sqrt(records) / np.square(1 + distances)
            cell_probabilities = _predict_probability(bundle, features)
            probabilities = [
                float(np.average(cell_probabilities, weights=weights))
            ]
            source = "distance_weighted_supported_model_cells"
            estimate_type = "statistical_fallback"
            merged_cells = len(candidates)
            max_distance = float(distances.max())
            effective_neighbors = float(weights.sum() ** 2 / np.square(weights).sum())
            statistical_details = {
                "method": "inverse_square_distance_weighted_mean_of_neighboring_model_predictions",
                "neighbor_cell_count": len(candidates),
                "effective_neighbor_count": round(effective_neighbors, 2),
                "maximum_neighbor_distance_km": round(max_distance, 2),
                "neighbor_cell_records": records.astype(int).tolist(),
            }

    if not source or not probabilities:
        return _unavailable(
            "No validated model prediction or supported historical neighbor was available within the configured research-mode distance.",
            {
                "status": "insufficient_data",
                "location_cell_records": exact_cell["records"] if exact_cell else 0,
                "requested_interval": target_time.isoformat(),
                "training_period": bundle["training_period"],
            },
            metrics,
        )

    probability = float(np.clip(probabilities[0], 0, 1))
    lower, upper = bundle["risk_probability_thresholds"]
    risk_level = (
        "Low" if probability <= lower else "Medium" if probability <= upper else "High"
    )
    safety_zone = {"Low": "Green", "Medium": "Yellow", "High": "Red"}[risk_level]
    if include_categories:
        category, other_categories, category_source, category_records = (
            _category_patterns(
                analyzer,
                latitude,
                longitude,
                target_time,
                reference_time,
                area_name,
                temporal_source,
            )
        )
    else:
        category, other_categories, category_source, category_records = (
            None,
            [],
            None,
            0,
        )
    coverage = {
        "status": "covered",
        "synthetic_dataset": True,
        "location_cell_records": exact_cell["records"] if exact_cell else 0,
        "merged_cell_count": merged_cells,
        "adaptive_grid_size_degrees": merge_level,
        "max_neighbor_distance_km": round(max_distance, 2),
        "locality": area_name,
        "estimation_method": source,
        "statistical_fallback": statistical_details,
        "requested_interval": target_time.isoformat(),
        "historical_reference_interval": reference_time.isoformat(),
        "temporal_fallback": temporal_source,
        "training_period": bundle["training_period"],
        "zero_interval_semantics": (
            "Zero means no crime record was present in that synthetic dataset interval; "
            "it is not a verified crime-free observation."
        ),
    }
    return {
        "crime_probability": {
            "status": "ok",
            "percentage": round(probability * 100, 1),
            "message": (
                "Experimental estimate of at least one recorded crime in a synthetic "
                "location-time interval. Zero-recorded-crime intervals are not verified "
                "crime-free periods."
            ),
        },
        "crime_risk_level": risk_level,
        "safety_zone": safety_zone,
        "coverage": coverage,
        "estimate_type": estimate_type,
        "estimate_label": {
            "model_based": "Model-Based Estimate",
            "nearby_data": "Nearby-Data Estimate",
            "statistical_fallback": "Statistical Fallback Estimate",
        }[estimate_type],
        "prediction_mode": "research_demo" if research_demo else "production",
        "validation": {
            "selected_model": bundle["selected_model"],
            "deployment_ready": True,
            "test_metrics": (
                metrics.get("models", {})
                .get(bundle["selected_model"], {})
                .get("test")
                if metrics
                else None
            ),
            "geographical_holdout": (
                metrics.get("geographical_holdout") if metrics else None
            ),
        },
        "most_likely_crime": category,
        "other_crime_categories": other_categories,
        "category_source": category_source,
        "category_records": category_records,
        "prediction_source": source,
        "fallback_used": source != "exact_grid_cell_selected_hour",
        "fallback_status": (
            "exact" if source == "exact_grid_cell_selected_hour" else source
        ),
    }
