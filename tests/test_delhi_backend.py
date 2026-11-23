import importlib
import sys
from pathlib import Path

import pandas as pd
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
server = importlib.import_module("server")


def _insufficient_prediction():
    return {
        "crime_probability": {"status": "insufficient_data", "percentage": None},
        "crime_risk_level": "Insufficient Data",
        "safety_zone": "Insufficient Data",
        "data_coverage": {"status": "insufficient_data"},
        "prediction_source": "insufficient_data",
        "fallback_used": False,
        "most_likely_crime": None,
    }


def test_summary_and_directory_endpoints_are_delhi_scoped():
    with TestClient(server.app) as client:
        summary = client.get("/api/summary").json()
        stations = client.get("/api/stations").json()["stations"]
        helplines = client.get("/api/helplines").json()["helplines"]

    assert summary["coverage"] == "Delhi NCT"
    assert len(stations) > 0
    assert all(server.is_within_delhi_nct(item["lat"], item["lng"]) for item in stations)
    assert helplines[0]["number"] == "112"


def test_nearby_does_not_call_empty_coverage_low_or_zero_risk(monkeypatch):
    async def insufficient(_lat, _lng, _at=None):
        return _insufficient_prediction()

    monkeypatch.setattr(server, "load_crime_data", lambda: pd.DataFrame())
    monkeypatch.setattr(server, "_analyze_delhi_location", insufficient)

    with TestClient(server.app) as client:
        response = client.get("/api/crime/nearby?lat=28.61&lng=77.21")

    assert response.status_code == 200
    result = response.json()
    assert result["incidents"] == 0
    assert result["risk_score"] is None
    assert result["risk_level"] == "Insufficient Data"
    assert result["safety_zone"] == "Insufficient Data"
    assert result["crime_probability"]["status"] == "insufficient_data"
