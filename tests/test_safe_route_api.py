import importlib
import sys
from datetime import datetime
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
server = importlib.import_module("server")


def _prediction_result(available):
    return {
        "crime_probability": {
            "status": "ok" if available else "insufficient_data",
            "percentage": 12.5 if available else None,
            "message": (
                "Experimental estimate." if available else "Insufficient coverage."
            ),
        },
        "crime_risk_level": "Medium" if available else "Insufficient Data",
        "safety_zone": "Yellow" if available else "Insufficient Data",
        "coverage": {"status": "covered" if available else "insufficient_data"},
        "prediction_source": (
            "exact_grid_cell_selected_hour" if available else "insufficient_data"
        ),
        "fallback_used": False,
        "estimate_type": "model_based" if available else "unavailable",
        "estimate_label": "Model-Based Estimate" if available else "Insufficient Data",
        "most_likely_crime": (
            {"category": "Theft", "probability": 60.0} if available else None
        ),
        "other_crime_categories": [],
    }


def test_route_risk_api_uses_segment_arrival_times_and_preserves_unknowns(
    monkeypatch,
):
    calls = []

    def estimate(_model, _analyzer, latitude, longitude, selected_at, **_kwargs):
        calls.append((latitude, longitude, selected_at))
        return _prediction_result(latitude < 28.7)

    monkeypatch.setattr(server, "get_delhi_analyzer", lambda: object())
    monkeypatch.setattr(
        server,
        "get_delhi_model",
        lambda: {
            "deployment_ready": True,
            "risk_probability_thresholds": (0.01, 0.05),
        },
    )
    monkeypatch.setattr(server, "estimate_location_risk", estimate)
    departure = datetime.fromisoformat("2026-11-24T18:00:00+05:30")

    with TestClient(server.app) as client:
        response = client.post(
            "/api/crime/route-risk",
            json={
                "departure_at": departure.isoformat(),
                "segments": [
                    {
                        "segment_id": "seg-0",
                        "latitude": 28.61,
                        "longitude": 77.21,
                        "minutes_from_departure": 4.5,
                        "duration_minutes": 2.0,
                    },
                    {
                        "segment_id": "seg-1",
                        "latitude": 28.82,
                        "longitude": 77.21,
                        "minutes_from_departure": 9,
                        "duration_minutes": 2.0,
                    },
                ],
            },
        )

    assert response.status_code == 200
    result = response.json()
    assert result["covered_segments"] == 1
    assert result["insufficient_segments"] == 1
    assert result["segments"][0]["arrival_time"] == "2026-11-24T18:04:30+05:30"
    assert result["segments"][0]["safety_zone"] == "Yellow"
    assert result["segments"][0]["estimate_label"] == "Model-Based Estimate"
    assert result["segments"][1]["safety_zone"] == "Unknown"
    assert calls[0][2].isoformat() == "2026-11-24T18:04:30+05:30"
    assert calls[1][2].isoformat() == "2026-11-24T18:09:00+05:30"


def test_route_risk_api_rejects_points_outside_delhi(monkeypatch):
    monkeypatch.setattr(server, "get_delhi_analyzer", lambda: object())
    monkeypatch.setattr(server, "get_delhi_model", lambda: None)

    with TestClient(server.app) as client:
        response = client.post(
            "/api/crime/route-risk",
            json={
                "departure_at": "2026-11-24T18:00:00+05:30",
                "segments": [
                    {
                        "segment_id": "outside",
                        "latitude": 26.85,
                        "longitude": 80.94,
                        "minutes_from_departure": 0,
                        "duration_minutes": 1,
                    }
                ],
            },
        )

    assert response.status_code == 422
    assert "within the NCT of Delhi" in response.json()["detail"]


def test_route_risk_api_rejects_points_in_bbox_but_outside_nct(monkeypatch):
    with TestClient(server.app) as client:
        response = client.post(
            "/api/crime/route-risk",
            json={
                "departure_at": "2026-11-24T18:00:00+05:30",
                "segments": [
                    {
                        "segment_id": "outside-nct",
                        "latitude": 28.45,
                        "longitude": 76.85,
                        "minutes_from_departure": 0,
                        "duration_minutes": 1,
                    }
                ],
            },
        )

    assert response.status_code == 422


def test_research_zone_endpoint_returns_estimates_for_the_full_grid(monkeypatch):
    seen = []

    def estimate(_model, _analyzer, latitude, longitude, selected_at, **_kwargs):
        seen.append((latitude, longitude, selected_at))
        return {
            "crime_probability": {"status": "ok", "percentage": 10.0},
            "safety_zone": "Yellow",
            "prediction_source": "distance_weighted_supported_model_cells",
            "estimate_type": "statistical_fallback",
            "estimate_label": "Statistical Fallback Estimate",
        }

    monkeypatch.setattr(server, "RESEARCH_DEMO_MODE", True)
    monkeypatch.setattr(server, "DELHI_ZONE_CACHE", {})
    monkeypatch.setattr(server, "get_delhi_analyzer", lambda: object())
    monkeypatch.setattr(server, "get_delhi_model", lambda: object())
    monkeypatch.setattr(server, "estimate_location_risk", estimate)

    with TestClient(server.app) as client:
        response = client.get(
            "/api/crime/zones?at=2026-11-24T18%3A00%3A00%2B05%3A30"
        )

    assert response.status_code == 200
    result = response.json()
    expected_cells = len(list(server.delhi_grid_cells()))
    assert result["grid_cell_count"] == expected_cells
    assert result["grid_cell_count"] < 675
    assert result["estimated_cell_count"] == expected_cells
    assert result["unknown_cell_count"] == 0
    assert result["prediction_mode"] == "research_demo"
    assert len(seen) == expected_cells
    assert all(call[2].hour == 18 for call in seen)
