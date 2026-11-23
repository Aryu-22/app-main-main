from datetime import datetime

import numpy as np
import pandas as pd
import pytest

from backend.crime_analysis import (
    DELHI_BOUNDS,
    DelhiCrimeAnalyzer,
    delhi_grid_cells,
    is_within_delhi_nct,
)
from backend.crime_model import estimate_location_risk, temporal_features
from backend.train_crime_model import _build_complete_grid


def test_zones_use_score_distribution_and_skip_sparse_cells():
    dataframe = pd.DataFrame(
        [
            {
                "cell_lat": 2840 + index // 20,
                "cell_lng": 7700,
                "Risk_Score": score,
            }
            for index, score in enumerate([10] * 20 + [20] * 20 + [40] * 20 + [30] * 5)
        ]
    )
    analyzer = DelhiCrimeAnalyzer(dataframe)

    result = analyzer.zones()

    assert {zone["safety_zone"] for zone in result["zones"]} == {
        "Green",
        "Yellow",
        "Red",
    }
    assert all(zone["records"] >= 5 for zone in result["zones"])
    assert result["score_source"] == "Delhi dataset Risk_Score"


def test_analyze_rejects_coordinates_outside_delhi():
    analyzer = DelhiCrimeAnalyzer(pd.DataFrame())

    with pytest.raises(ValueError, match="outside the Delhi NCT"):
        analyzer.analyze(28.6, 77.5)
    with pytest.raises(ValueError, match="outside the Delhi NCT"):
        analyzer.analyze(28.45, 76.85)


def test_analyze_reports_insufficient_occurrence_probability():
    dataframe = pd.DataFrame(
        [
            {
                "Latitude": 28.61,
                "Longitude": 77.21,
                "Area_Name": "Central Delhi",
                "Date": pd.Timestamp("2024-01-01"),
                "Hour": 12,
                "Day_of_Week": 0,
                "Primary_Crime_Type": "Theft",
                "Crime_Count": 1,
                "Risk_Score": 25,
                "cell_lat": 2861,
                "cell_lng": 7721,
            }
        ]
    )
    analyzer = DelhiCrimeAnalyzer(dataframe)

    result = analyzer.analyze(28.61, 77.21, datetime(2026, 1, 5, 12))

    assert result["crime_probability"]["status"] == "insufficient_data"
    assert result["crime_probability"]["percentage"] is None
    assert result["selected_location"]["area_name"] == "Central Delhi"


def test_category_shares_use_historical_time_matched_records():
    dataframe = pd.DataFrame(
        [
            {
                "Latitude": 28.61,
                "Longitude": 77.21,
                "Area_Name": "Central Delhi",
                "Date": pd.Timestamp("2024-01-01"),
                "Hour": 12,
                "Day_of_Week": 0,
                "Primary_Crime_Type": "Theft" if index < 6 else "Assault",
                "Crime_Count": 3 if index < 6 else 1,
                "Risk_Score": 25,
                "cell_lat": 2861,
                "cell_lng": 7721,
            }
            for index in range(10)
        ]
    )
    analyzer = DelhiCrimeAnalyzer(dataframe)

    result = analyzer.analyze(28.61, 77.21, datetime(2026, 1, 5, 12))

    assert result["most_likely_crime"]["category"] == "Theft"
    assert result["most_likely_crime"]["probability"] == 81.8
    assert result["other_crime_categories"][0]["category"] == "Assault"
    assert result["time_context"]["records_used"] == 10
    assert result["crime_probability"]["percentage"] is None


def test_complete_hour_grid_labels_only_missing_records_as_zero_and_lags_history():
    source = pd.DataFrame(
        [
            {
                "Date": pd.Timestamp("2024-01-01"),
                "Hour": 0,
                "Crime_Count": 2,
                "cell_lat": 2860,
                "cell_lng": 7720,
                "Latitude": 28.61,
                "Longitude": 77.21,
                "Area_Type": "Market",
            },
            {
                "Date": pd.Timestamp("2024-01-01"),
                "Hour": 2,
                "Crime_Count": 3,
                "cell_lat": 2860,
                "cell_lng": 7720,
                "Latitude": 28.61,
                "Longitude": 77.21,
                "Area_Type": "Market",
            },
            {
                "Date": pd.Timestamp("2024-01-01"),
                "Hour": 2,
                "Crime_Count": 1,
                "cell_lat": 2861,
                "cell_lng": 7720,
                "Latitude": 28.63,
                "Longitude": 77.21,
                "Area_Type": "Residential",
            },
        ]
    )

    features, target, hours, cells, counts = _build_complete_grid(source)

    first_cell_rows = features["Cell_ID"].astype(str) == cells[0]["Cell_ID"]
    first_cell = features.loc[first_cell_rows].reset_index(drop=True)
    first_target = target[first_cell_rows.to_numpy()]
    assert len(hours) == 3
    assert len(features) == 6
    assert len(cells) == 2
    assert counts[first_cell_rows.to_numpy()].tolist() == [2, 0, 3]
    assert first_target.tolist() == [1, 0, 1]
    assert first_cell["HistoricalCount7D"].tolist() == [0, 2, 2]
    assert first_cell["HistoricalCountTotal"].tolist() == [0, 2, 2]


def test_model_validation_failure_returns_insufficient_data():
    analyzer = DelhiCrimeAnalyzer(pd.DataFrame())
    bundle = {
        "deployment_ready": False,
        "evaluation_metrics": {"validation_reasons": ["low AUC"]},
    }

    result = estimate_location_risk(
        bundle, analyzer, 28.61, 77.21, datetime(2026, 1, 5, 12)
    )

    assert result["crime_probability"]["status"] == "insufficient_data"
    assert result["crime_probability"]["percentage"] is None
    assert result["crime_risk_level"] == "Insufficient Data"


class _ConstantPipeline:
    def predict_proba(self, features):
        return np.tile([0.8, 0.2], (len(features), 1))


class _LogitCalibrator:
    def predict_proba(self, logits):
        probabilities = 1 / (1 + np.exp(-logits[:, 0]))
        return np.column_stack((1 - probabilities, probabilities))


def _prediction_bundle():
    return {
        "deployment_ready": True,
        "pipeline": _ConstantPipeline(),
        "calibrator": _LogitCalibrator(),
        "risk_probability_thresholds": (0.25, 0.75),
        "training_period": {"start": "2024-01-01", "end": "2025-12-31"},
        "selected_model": "xgboost",
        "evaluation_metrics": {
            "models": {"xgboost": {"test": {"roc_auc": 0.8, "brier_score": 0.02}}},
        },
    }


def _crime_records(cells, records_per_cell, area_name="Central Delhi"):
    rows = []
    dates = [
        pd.Timestamp("2024-01-01") + pd.Timedelta(days=60 * index)
        for index in range(records_per_cell)
    ]
    for cell_lat, cell_lng in cells:
        for date in dates:
            rows.append(
                {
                    "Latitude": (cell_lat + 0.5) * 0.02,
                    "Longitude": (cell_lng + 0.5) * 0.02,
                    "Area_Name": area_name,
                    "Area_Type": "Mixed",
                    "Date": date,
                    "Hour": 12,
                    "Day_of_Week": date.dayofweek,
                    "Primary_Crime_Type": "Theft",
                    "Crime_Count": 1,
                    "Risk_Score": 25,
                    "cell_lat": cell_lat,
                    "cell_lng": cell_lng,
                }
            )
    return pd.DataFrame(rows)


def test_cyclical_temporal_features_cover_hour_weekday_and_month():
    features = temporal_features(pd.Timestamp("2024-12-31 23:00"))

    assert features["Hour"] == 23
    assert features["DayOfWeek"] == 1
    assert features["Month"] == 12
    assert features["IsWeekend"] == 0
    assert -1 <= features["HourSin"] <= 1
    assert -1 <= features["WeekdayCos"] <= 1


def test_adaptive_grid_fallback_pools_supported_cells():
    analyzer = DelhiCrimeAnalyzer(
        _crime_records([(1430, 3860), (1430, 3861)], records_per_cell=30)
    )

    result = estimate_location_risk(
        _prediction_bundle(), analyzer, 28.63, 77.21, datetime(2026, 1, 5, 12)
    )

    assert result["crime_probability"]["status"] == "ok"
    assert result["prediction_source"] == "adaptive_grid_0.04_selected_hour"
    assert result["fallback_used"] is True
    assert result["coverage"]["merged_cell_count"] == 2
    assert result["safety_zone"] == "Green"


def test_nearby_cell_fallback_is_used_after_adaptive_grid_fails():
    analyzer = DelhiCrimeAnalyzer(
        _crime_records([(1430, 3860), (1432, 3860)], records_per_cell=30)
    )

    result = estimate_location_risk(
        _prediction_bundle(), analyzer, 28.63, 77.21, datetime(2026, 1, 5, 12)
    )

    assert result["prediction_source"] == "nearby_supported_cells_5km_selected_hour"
    assert result["coverage"]["merged_cell_count"] == 2
    assert result["fallback_used"] is True


def test_same_cell_similar_hour_fallback_is_used_before_locality():
    analyzer = DelhiCrimeAnalyzer(_crime_records([(1430, 3860)], records_per_cell=12))

    result = estimate_location_risk(
        _prediction_bundle(), analyzer, 28.61, 77.21, datetime(2026, 1, 5, 12)
    )

    assert result["prediction_source"] == "same_cell_similar_hours"
    assert result["fallback_used"] is True


def test_distance_weighted_research_fallback_handles_remote_cells_and_future_dates():
    cells = [(1430 + row, 3860 + column) for row in range(3) for column in range(2)]
    analyzer = DelhiCrimeAnalyzer(
        _crime_records(cells, records_per_cell=9, area_name="")
    )

    result = estimate_location_risk(
        _prediction_bundle(),
        analyzer,
        28.55,
        77.15,
        datetime(2040, 1, 2, 18),
        research_demo=True,
    )

    assert result["crime_probability"]["status"] == "ok"
    assert result["prediction_source"] == "distance_weighted_supported_model_cells"
    assert result["fallback_used"] is True
    assert result["estimate_type"] == "statistical_fallback"
    assert result["estimate_label"] == "Statistical Fallback Estimate"
    assert result["coverage"]["temporal_fallback"] == "future_seasonal_pattern"
    assert result["coverage"]["statistical_fallback"]["neighbor_cell_count"] > 0
    assert result["coverage"]["statistical_fallback"]["maximum_neighbor_distance_km"] < 15


def test_locality_patterns_pool_observed_model_predictions():
    cells = [(1430 + row, 3860 + column) for row in range(3) for column in range(2)]
    analyzer = DelhiCrimeAnalyzer(_crime_records(cells, records_per_cell=9))

    result = estimate_location_risk(
        _prediction_bundle(),
        analyzer,
        28.55,
        77.15,
        datetime(2026, 1, 5, 12),
        research_demo=True,
    )

    assert result["crime_probability"]["status"] == "ok"
    assert result["prediction_source"] == "locality_weighted_supported_model_cells"
    assert result["estimate_type"] == "nearby_data"


def test_sparse_observed_cell_uses_a_labeled_research_estimate():
    analyzer = DelhiCrimeAnalyzer(_crime_records([(1430, 3860)], records_per_cell=9))

    result = estimate_location_risk(
        _prediction_bundle(),
        analyzer,
        28.61,
        77.21,
        datetime(2026, 1, 5, 12),
        research_demo=True,
    )

    assert result["crime_probability"]["status"] == "ok"
    assert result["estimate_type"] == "nearby_data"
    assert result["estimate_label"] == "Nearby-Data Estimate"


def test_research_grid_tiles_the_configured_delhi_extent():
    cells = list(delhi_grid_cells())
    south, north, west, east = DELHI_BOUNDS

    assert 0 < len(cells) < 675
    assert all(
        south <= cell["center"][0] <= north
        and west <= cell["center"][1] <= east
        and is_within_delhi_nct(*cell["center"])
        for cell in cells
    )
    assert min(cell["bounds"][0][0] for cell in cells) >= south
    assert max(cell["bounds"][1][0] for cell in cells) <= north
    assert min(cell["bounds"][0][1] for cell in cells) >= west
    assert max(cell["bounds"][1][1] for cell in cells) <= east


def test_unsupported_location_does_not_get_a_green_zone():
    analyzer = DelhiCrimeAnalyzer(_crime_records([(1430, 3860)], records_per_cell=5))

    result = estimate_location_risk(
        _prediction_bundle(), analyzer, 28.61, 77.21, datetime(2026, 1, 5, 12)
    )

    assert result["crime_probability"]["status"] == "insufficient_data"
    assert result["safety_zone"] == "Insufficient Data"
