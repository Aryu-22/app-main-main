"""Build and validate experimental models for recorded incidents in Delhi_dataset.csv."""

import json
import logging
import os
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    average_precision_score,
    brier_score_loss,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder
from xgboost import XGBClassifier

try:
    from .crime_analysis import GRID_SIZE, load_delhi_dataset
    from .crime_model import CATEGORICAL_FEATURES, NUMERIC_FEATURES
except ImportError:
    from crime_analysis import GRID_SIZE, load_delhi_dataset
    from crime_model import CATEGORICAL_FEATURES, NUMERIC_FEATURES

logger = logging.getLogger("delhi_crime_training")
ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_PATH = Path(
    os.getenv("DELHI_CRIME_DATA_PATH", ROOT_DIR / "data" / "Delhi_dataset.csv")
)
ARTIFACT_DIR = Path(
    os.getenv("DELHI_MODEL_ARTIFACT_DIR", Path(__file__).parent / "artifacts")
)
NEGATIVE_TO_POSITIVE_RATIO = 5
RANDOM_SEED = 42


def _build_complete_grid(dataframe):
    start = (dataframe["Date"].min() + pd.Timedelta(hours=0)).floor("h")
    last_event_hour = (
        (dataframe["Date"] + pd.to_timedelta(dataframe["Hour"], unit="h"))
        .max()
        .floor("h")
    )
    hours = pd.date_range(start=start, end=last_event_hour, freq="h")

    source = dataframe.copy()
    source["Cell_ID"] = (
        source["cell_lat"].astype(str) + ":" + source["cell_lng"].astype(str)
    )
    source["Interval"] = source["Date"] + pd.to_timedelta(source["Hour"], unit="h")
    counts = source.groupby(["Cell_ID", "Interval"])["Crime_Count"].sum()
    cell_groups = source.groupby("Cell_ID", sort=True)
    cells = []
    for cell_id, group in cell_groups:
        area_type = group["Area_Type"].mode()
        cell_lat = int(group["cell_lat"].iloc[0])
        cell_lng = int(group["cell_lng"].iloc[0])
        cells.append(
            {
                "Cell_ID": cell_id,
                "Latitude": (cell_lat + 0.5) * GRID_SIZE,
                "Longitude": (cell_lng + 0.5) * GRID_SIZE,
                "Area_Type": (
                    str(area_type.iloc[0]) if not area_type.empty else "Unknown"
                ),
                "cell_lat": cell_lat,
                "cell_lng": cell_lng,
                "records": int(len(group)),
            }
        )

    hour_count = len(hours)
    cell_count = len(cells)
    total_rows = hour_count * cell_count
    cell_ids = np.repeat(
        np.asarray([cell["Cell_ID"] for cell in cells], dtype=object), hour_count
    )
    latitude = np.repeat(
        np.asarray([cell["Latitude"] for cell in cells], dtype=np.float32), hour_count
    )
    longitude = np.repeat(
        np.asarray([cell["Longitude"] for cell in cells], dtype=np.float32), hour_count
    )
    area_types = np.repeat(
        np.asarray([cell["Area_Type"] for cell in cells], dtype=object), hour_count
    )
    crime_counts = np.zeros(total_rows, dtype=np.float32)
    history_7d = np.zeros(total_rows, dtype=np.float32)
    history_total = np.zeros(total_rows, dtype=np.float32)
    same_hour_4w = np.zeros(total_rows, dtype=np.float32)
    interval_positions = {timestamp: index for index, timestamp in enumerate(hours)}

    for cell_index, cell in enumerate(cells):
        row_start = cell_index * hour_count
        row_end = row_start + hour_count
        cell_counts = np.zeros(hour_count, dtype=np.float32)
        cell_series = counts.loc[cell["Cell_ID"]]
        for timestamp, value in cell_series.items():
            position = interval_positions.get(timestamp)
            if position is not None:
                cell_counts[position] = float(value)

        prefix = np.empty(hour_count + 1, dtype=np.float64)
        prefix[0] = 0
        np.cumsum(cell_counts, dtype=np.float64, out=prefix[1:])
        positions = np.arange(hour_count)
        starts = np.maximum(0, positions - 168)
        history_7d[row_start:row_end] = (prefix[positions] - prefix[starts]).astype(
            np.float32
        )
        history_total[row_start:row_end] = prefix[positions].astype(np.float32)
        for lag in (168, 336, 504, 672):
            if lag < hour_count:
                same_hour_4w[row_start + lag : row_end] += cell_counts[
                    : hour_count - lag
                ]
        crime_counts[row_start:row_end] = cell_counts

    features = pd.DataFrame(
        {
            "Latitude": latitude,
            "Longitude": longitude,
            "Hour": np.tile(hours.hour.astype(np.uint8), cell_count),
            "DayOfWeek": np.tile(hours.dayofweek.astype(np.uint8), cell_count),
            "Month": np.tile(hours.month.astype(np.uint8), cell_count),
            "HourSin": np.tile(np.sin(2 * np.pi * hours.hour / 24), cell_count),
            "HourCos": np.tile(np.cos(2 * np.pi * hours.hour / 24), cell_count),
            "WeekdaySin": np.tile(np.sin(2 * np.pi * hours.dayofweek / 7), cell_count),
            "WeekdayCos": np.tile(np.cos(2 * np.pi * hours.dayofweek / 7), cell_count),
            "MonthSin": np.tile(np.sin(2 * np.pi * (hours.month - 1) / 12), cell_count),
            "MonthCos": np.tile(np.cos(2 * np.pi * (hours.month - 1) / 12), cell_count),
            "IsWeekend": np.tile((hours.dayofweek >= 5).astype(np.uint8), cell_count),
            "HistoricalCount7D": history_7d,
            "HistoricalCountTotal": history_total,
            "HistoricalSameHour4W": same_hour_4w,
            "Cell_ID": pd.Categorical(
                cell_ids, categories=[cell["Cell_ID"] for cell in cells]
            ),
            "Area_Type": pd.Categorical(area_types, categories=sorted(set(area_types))),
        },
        columns=NUMERIC_FEATURES + CATEGORICAL_FEATURES,
    )
    target = (crime_counts > 0).astype(np.uint8)
    return features, target, hours, cells, crime_counts


def _make_preprocessor():
    return ColumnTransformer(
        [
            ("numeric", "passthrough", NUMERIC_FEATURES),
            (
                "categorical",
                OneHotEncoder(
                    handle_unknown="ignore", sparse_output=True, dtype=np.float32
                ),
                CATEGORICAL_FEATURES,
            ),
        ],
        sparse_threshold=1.0,
    )


def _calibration_input(probabilities):
    clipped = np.clip(probabilities, 1e-6, 1 - 1e-6)
    return np.log(clipped / (1 - clipped)).reshape(-1, 1)


def _expected_calibration_error(y_true, probabilities, bin_count=10):
    edges = np.linspace(0, 1, bin_count + 1)
    bins = []
    error = 0.0
    for index in range(bin_count):
        mask = (probabilities >= edges[index]) & (
            probabilities <= edges[index + 1]
            if index == bin_count - 1
            else probabilities < edges[index + 1]
        )
        count = int(mask.sum())
        if not count:
            continue
        observed = float(y_true[mask].mean())
        predicted = float(probabilities[mask].mean())
        error += count / len(y_true) * abs(observed - predicted)
        bins.append(
            {
                "lower_probability": float(edges[index]),
                "upper_probability": float(edges[index + 1]),
                "count": count,
                "mean_predicted": predicted,
                "observed_rate": observed,
            }
        )
    return float(error), bins


def _best_f1_threshold(y_true, probabilities):
    precision, recall, thresholds = precision_recall_curve(y_true, probabilities)
    if not len(thresholds):
        return 0.5
    f1 = (
        2
        * precision[:-1]
        * recall[:-1]
        / np.maximum(precision[:-1] + recall[:-1], 1e-12)
    )
    return float(thresholds[int(np.argmax(f1))])


def _evaluate(y_true, probabilities, threshold):
    ece, calibration_bins = _expected_calibration_error(y_true, probabilities)
    labels = probabilities >= threshold
    prevalence = float(y_true.mean())
    return {
        "intervals": int(len(y_true)),
        "positive_intervals": int(y_true.sum()),
        "zero_recorded_crime_intervals": int(len(y_true) - y_true.sum()),
        "prevalence": prevalence,
        "precision": float(precision_score(y_true, labels, zero_division=0)),
        "recall": float(recall_score(y_true, labels, zero_division=0)),
        "f1": float(f1_score(y_true, labels, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_true, probabilities)),
        "precision_recall_auc": float(average_precision_score(y_true, probabilities)),
        "brier_score": float(brier_score_loss(y_true, probabilities)),
        "constant_prevalence_brier_baseline": float(prevalence * (1 - prevalence)),
        "expected_calibration_error": ece,
        "calibration_bins": calibration_bins,
        "classification_threshold_from_validation": float(threshold),
    }


def _sample_training_rows(features, target, train_mask):
    positive = np.flatnonzero(train_mask & (target == 1))
    negative = np.flatnonzero(train_mask & (target == 0))
    if len(positive) < 100:
        raise ValueError(
            "Chronological training split has fewer than 100 positive intervals."
        )
    sample_count = min(len(negative), len(positive) * NEGATIVE_TO_POSITIVE_RATIO)
    rng = np.random.default_rng(RANDOM_SEED)
    sampled_negative = rng.choice(negative, size=sample_count, replace=False)
    selected = np.sort(np.concatenate((positive, sampled_negative)))
    return features.iloc[selected], target[selected]


def _geographical_holdout_evaluation(
    model_name,
    classifier,
    features,
    target,
    cells,
    interval_positions,
    train_end,
    validation_end,
):
    rng = np.random.default_rng(RANDOM_SEED)
    heldout_count = max(1, int(round(len(cells) * 0.20)))
    heldout_indices = set(
        rng.choice(len(cells), size=heldout_count, replace=False).tolist()
    )
    heldout_ids = {
        cell["Cell_ID"] for index, cell in enumerate(cells) if index in heldout_indices
    }
    cell_ids = features["Cell_ID"].astype(str).to_numpy()
    heldout = np.isin(cell_ids, list(heldout_ids))
    temporal_train = np.tile(interval_positions < train_end, len(cells))
    temporal_validation = np.tile(
        (interval_positions >= train_end) & (interval_positions < validation_end),
        len(cells),
    )
    temporal_test = np.tile(interval_positions >= validation_end, len(cells))
    train_mask = temporal_train & ~heldout
    validation_mask = temporal_validation & ~heldout
    test_mask = temporal_test & heldout
    if (
        int(target[train_mask].sum()) < 100
        or int(target[validation_mask].sum()) < 100
        or int(target[test_mask].sum()) < 100
    ):
        return {
            "status": "insufficient_data",
            "reason": "A geographical split has fewer than 100 positive intervals.",
            "heldout_cells": len(heldout_ids),
        }

    training_features, training_target = _sample_training_rows(
        features, target, train_mask
    )
    pipeline = Pipeline(
        [("preprocessor", _make_preprocessor()), ("classifier", clone(classifier))]
    )
    pipeline.fit(training_features, training_target)
    raw_validation = pipeline.predict_proba(features.loc[validation_mask])[:, 1]
    calibrator = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000)
    calibrator.fit(_calibration_input(raw_validation), target[validation_mask])
    validation_probabilities = calibrator.predict_proba(
        _calibration_input(raw_validation)
    )[:, 1]
    threshold = _best_f1_threshold(target[validation_mask], validation_probabilities)
    raw_test = pipeline.predict_proba(features.loc[test_mask])[:, 1]
    calibrated_test = calibrator.predict_proba(_calibration_input(raw_test))[:, 1]
    return {
        "status": "ok",
        "heldout_cells": len(heldout_ids),
        "heldout_cell_ids": sorted(heldout_ids),
        "train_cells": len(cells) - len(heldout_ids),
        "metrics": _evaluate(target[test_mask], calibrated_test, threshold),
    }


def train_and_save(data_path=DATA_PATH, artifact_dir=ARTIFACT_DIR):
    dataframe = load_delhi_dataset(data_path)
    if dataframe.empty:
        raise ValueError("Delhi dataset has no valid records for training.")
    if "Area_Type" not in dataframe:
        raise ValueError("Delhi dataset needs Area_Type for model training.")

    features, target, hours, cells, _ = _build_complete_grid(dataframe)
    interval_count = len(hours)
    train_end = int(interval_count * 0.70)
    validation_end = int(interval_count * 0.85)
    cell_count = len(cells)
    interval_positions = np.arange(interval_count)
    train_mask = np.tile(interval_positions < train_end, cell_count)
    validation_mask = np.tile(
        (interval_positions >= train_end) & (interval_positions < validation_end),
        cell_count,
    )
    test_mask = np.tile(interval_positions >= validation_end, cell_count)

    training_features, training_target = _sample_training_rows(
        features, target, train_mask
    )
    validation_features = features.loc[validation_mask]
    validation_target = target[validation_mask]
    test_features = features.loc[test_mask]
    test_target = target[test_mask]
    if min(int(validation_target.sum()), int(test_target.sum())) < 100:
        raise ValueError(
            "Chronological validation/test splits need at least 100 positive intervals each."
        )

    cpu_count = os.cpu_count() or 2
    models = {
        "random_forest": RandomForestClassifier(
            n_estimators=120,
            max_depth=16,
            min_samples_leaf=3,
            max_features="sqrt",
            n_jobs=min(cpu_count, 8),
            random_state=RANDOM_SEED,
        ),
        "xgboost": XGBClassifier(
            n_estimators=160,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.85,
            colsample_bytree=0.85,
            reg_lambda=2,
            objective="binary:logistic",
            eval_metric="logloss",
            tree_method="hist",
            n_jobs=min(cpu_count, 8),
            random_state=RANDOM_SEED,
            verbosity=0,
        ),
    }

    evaluations = {}
    candidates = {}
    validation_predictions = {}
    for model_name, classifier in models.items():
        logger.info("Training %s on %d intervals.", model_name, len(training_target))
        pipeline = Pipeline(
            [("preprocessor", _make_preprocessor()), ("classifier", classifier)]
        )
        pipeline.fit(training_features, training_target)
        raw_validation = pipeline.predict_proba(validation_features)[:, 1]
        calibrator = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000)
        calibrator.fit(_calibration_input(raw_validation), validation_target)
        calibrated_validation = calibrator.predict_proba(
            _calibration_input(raw_validation)
        )[:, 1]
        threshold = _best_f1_threshold(validation_target, calibrated_validation)
        validation_metrics = _evaluate(
            validation_target, calibrated_validation, threshold
        )

        raw_test = pipeline.predict_proba(test_features)[:, 1]
        calibrated_test = calibrator.predict_proba(_calibration_input(raw_test))[:, 1]
        test_metrics = _evaluate(test_target, calibrated_test, threshold)
        evaluations[model_name] = {
            "validation": validation_metrics,
            "test": test_metrics,
        }
        candidates[model_name] = {
            "pipeline": pipeline,
            "calibrator": calibrator,
            "threshold": threshold,
            "validation_brier": validation_metrics["brier_score"],
        }
        validation_predictions[model_name] = calibrated_validation

    selected_model = min(
        candidates, key=lambda name: candidates[name]["validation_brier"]
    )
    selected = candidates[selected_model]
    geographical_holdout = _geographical_holdout_evaluation(
        selected_model,
        models[selected_model],
        features,
        target,
        cells,
        interval_positions,
        train_end,
        validation_end,
    )
    risk_lower, risk_upper = np.quantile(
        validation_predictions[selected_model], [1 / 3, 2 / 3]
    )
    selected_test = evaluations[selected_model]["test"]
    validation = evaluations[selected_model]["validation"]
    validation_reasons = []
    if selected_test["roc_auc"] < 0.55:
        validation_reasons.append("test ROC-AUC below 0.55")
    if (
        selected_test["brier_score"]
        >= selected_test["constant_prevalence_brier_baseline"]
    ):
        validation_reasons.append(
            "test Brier score did not beat the prevalence baseline"
        )
    if selected_test["expected_calibration_error"] > 0.12:
        validation_reasons.append("test expected calibration error above 0.12")
    if not risk_lower < risk_upper:
        validation_reasons.append(
            "validation probabilities do not support distinct risk bands"
        )
    if validation["positive_intervals"] < 100:
        validation_reasons.append(
            "validation split has fewer than 100 positive intervals"
        )
    if selected_test["positive_intervals"] < 100:
        validation_reasons.append("test split has fewer than 100 positive intervals")
    geographic_metrics = geographical_holdout.get("metrics")
    if geographic_metrics is None:
        validation_reasons.append("geographical holdout evaluation is unavailable")
    else:
        if geographic_metrics["roc_auc"] < 0.55:
            validation_reasons.append("geographical holdout ROC-AUC below 0.55")
        if (
            geographic_metrics["brier_score"]
            >= geographic_metrics["constant_prevalence_brier_baseline"]
        ):
            validation_reasons.append(
                "geographical holdout Brier score did not beat the prevalence baseline"
            )

    interval_counts = int(len(target))
    positive_intervals = int(target.sum())
    metrics = {
        "dataset": "Delhi_dataset.csv",
        "dataset_is_synthetic": True,
        "prediction_target": "at least one recorded crime in a grid-cell hourly interval",
        "zero_label_semantics": (
            "Crime_Count=0 means no record was present in that synthetic interval; "
            "it is not a verified crime-free observation."
        ),
        "geographical_grid_size_degrees": GRID_SIZE,
        "available_cells": cell_count,
        "hourly_intervals_per_cell": interval_count,
        "complete_grid_intervals": interval_counts,
        "positive_recorded_crime_intervals": positive_intervals,
        "zero_recorded_crime_intervals": interval_counts - positive_intervals,
        "training_negative_sampling_ratio": NEGATIVE_TO_POSITIVE_RATIO,
        "chronological_split": {
            "training": 0.70,
            "validation_calibration": 0.15,
            "test": 0.15,
        },
        "training_period": {
            "start": hours[0].isoformat(),
            "end": hours[-1].isoformat(),
        },
        "chronological_windows": {
            "train": {
                "start": hours[0].isoformat(),
                "end": hours[train_end - 1].isoformat(),
            },
            "validation_calibration": {
                "start": hours[train_end].isoformat(),
                "end": hours[validation_end - 1].isoformat(),
            },
            "test": {
                "start": hours[validation_end].isoformat(),
                "end": hours[-1].isoformat(),
            },
        },
        "library_versions": {
            "scikit_learn": sklearn.__version__,
            "xgboost": xgboost.__version__,
        },
        "selected_model": selected_model,
        "risk_probability_thresholds": {
            "low_medium": float(risk_lower),
            "medium_high": float(risk_upper),
        },
        "deployment_ready": not validation_reasons,
        "validation_reasons": validation_reasons,
        "models": evaluations,
        "geographical_holdout": geographical_holdout,
    }

    bundle = {
        "pipeline": selected["pipeline"],
        "calibrator": selected["calibrator"],
        "selected_model": selected_model,
        "deployment_ready": not validation_reasons,
        "risk_probability_thresholds": (float(risk_lower), float(risk_upper)),
        "training_period": metrics["training_period"],
        "evaluation_metrics": metrics,
    }
    artifact_dir = Path(artifact_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)
    model_path = artifact_dir / "delhi_crime_model.joblib"
    preprocessing_path = artifact_dir / "delhi_preprocessing_pipeline.joblib"
    metrics_path = artifact_dir / "delhi_model_metrics.json"
    joblib.dump(bundle, model_path, compress=3)
    joblib.dump(
        selected["pipeline"].named_steps["preprocessor"], preprocessing_path, compress=3
    )
    with metrics_path.open("w", encoding="utf-8") as metrics_file:
        json.dump(metrics, metrics_file, indent=2, allow_nan=False)

    logger.info(
        "Selected %s; deployment_ready=%s; test ROC-AUC=%.4f Brier=%.6f.",
        selected_model,
        not validation_reasons,
        selected_test["roc_auc"],
        selected_test["brier_score"],
    )
    return metrics


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s"
    )
    results = train_and_save()
    print(json.dumps(results, indent=2))
