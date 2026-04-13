from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from app.services.race_day_simulation import AthleteFitnessMetrics, RaceDaySimulationService, WeatherForecast, simulate_race_day


client = TestClient(app)


def test_course_profile_fetch_returns_eagleman() -> None:
    service = RaceDaySimulationService()
    profile = service.get_course_profile("ironman-70.3-eagleman")

    assert profile["slug"] == "ironman-70.3-eagleman"
    assert profile["name"] == "Ironman 70.3 Eagleman"
    assert profile["bike_distance_km"] == 90.1
    assert len(profile["segments"]) == 3


def test_simulation_engine_applies_weather_and_efficiency() -> None:
    result = simulate_race_day(
        course_slug="ironman-70.3-eagleman",
        athlete_metrics=AthleteFitnessMetrics(
            swim_css_seconds_per_100m=104,
            bike_ftp_watts=285,
            body_mass_kg=72,
            run_threshold_pace_seconds_per_km=275,
            historical_aerobic_efficiency=71,
            swim_aerobic_efficiency=73,
            bike_aerobic_efficiency=68,
            run_aerobic_efficiency=69,
            fatigue_index=18,
        ),
        weather_forecast=WeatherForecast(
            air_temp_c=29,
            water_temp_c=25,
            wind_speed_kph=24,
            humidity_percent=84,
        ),
    )

    assert result.total_predicted_seconds > result.total_baseline_seconds
    assert result.confidence >= 0.42
    assert any("wind" in note.lower() for note in result.notes)
    assert [item.discipline for item in result.splits] == ["swim", "bike", "run"]
    assert result.splits[0].predicted_seconds > 0


def test_course_profile_endpoint_returns_profiles() -> None:
    response = client.get("/api/v1/race-day/course-profiles")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["slug"] == "ironman-70.3-eagleman"


def test_race_day_simulation_endpoint() -> None:
    response = client.post(
        "/api/v1/race-day/simulate",
        json={
            "course_slug": "ironman-70.3-eagleman",
            "athlete_metrics": {
                "swim_css_seconds_per_100m": 106,
                "bike_ftp_watts": 260,
                "body_mass_kg": 70,
                "run_threshold_pace_seconds_per_km": 290,
                "historical_aerobic_efficiency": 64,
                "fatigue_index": 22,
            },
            "weather_forecast": {
                "air_temp_c": 26,
                "wind_speed_kph": 18,
                "humidity_percent": 77,
            },
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["course_profile"]["slug"] == "ironman-70.3-eagleman"
    assert body["total_time"]
    assert len(body["splits"]) == 3
    assert body["splits"][1]["discipline"] == "bike"
