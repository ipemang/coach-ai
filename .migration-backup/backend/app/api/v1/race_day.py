from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.security import AuthenticatedPrincipal, require_roles
from app.services.race_day_simulation import (
    AthleteFitnessMetrics,
    WeatherForecast,
    get_course_profile,
    list_course_profiles,
    simulate_race_day,
)

router = APIRouter(prefix="/api/v1/race-day", tags=["race-day"])


class RaceCourseProfileResponse(BaseModel):
    slug: str
    name: str
    venue: str
    swim_distance_meters: float
    bike_distance_km: float
    run_distance_km: float
    swim_open_water_penalty: float
    bike_elevation_gain_meters: float
    run_elevation_gain_meters: float
    bike_exposure_factor: float
    run_heat_exposure_factor: float
    transition_seconds: int
    segments: list[dict[str, Any]] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
    source: str


class WeatherForecastInput(BaseModel):
    air_temp_c: float | None = None
    water_temp_c: float | None = None
    wind_speed_kph: float | None = None
    wind_gust_kph: float | None = None
    humidity_percent: float | None = None
    cloud_cover_percent: float | None = None
    precipitation_mm: float | None = None
    precipitation_probability_percent: float | None = None


class AthleteFitnessMetricsInput(BaseModel):
    swim_css_seconds_per_100m: float | None = Field(default=None, ge=0)
    bike_ftp_watts: float | None = Field(default=None, ge=0)
    body_mass_kg: float | None = Field(default=None, ge=0)
    run_threshold_pace_seconds_per_km: float | None = Field(default=None, ge=0)
    historical_aerobic_efficiency: float | None = Field(default=None, ge=0, le=100)
    swim_aerobic_efficiency: float | None = Field(default=None, ge=0, le=100)
    bike_aerobic_efficiency: float | None = Field(default=None, ge=0, le=100)
    run_aerobic_efficiency: float | None = Field(default=None, ge=0, le=100)
    fatigue_index: float | None = Field(default=None, ge=0, le=100)
    current_fitness_score: float | None = Field(default=None, ge=0, le=100)


class RaceSimulationRequest(BaseModel):
    course_slug: str = Field(default="ironman-70.3-eagleman", min_length=1)
    athlete_metrics: AthleteFitnessMetricsInput
    weather_forecast: WeatherForecastInput | None = None
    course_profile_override: dict[str, Any] | None = None


class SplitPredictionResponse(BaseModel):
    discipline: str
    distance_meters: float
    baseline_seconds: int
    predicted_seconds: int
    adjustment_seconds: int
    adjustment_factors: list[str] = Field(default_factory=list)
    baseline_time: str
    predicted_time: str


class RaceSimulationResponse(BaseModel):
    course_profile: dict[str, Any]
    athlete_metrics: dict[str, Any]
    weather_forecast: dict[str, Any]
    splits: list[SplitPredictionResponse]
    total_baseline_seconds: int
    total_predicted_seconds: int
    total_time: str
    confidence: float
    notes: list[str] = Field(default_factory=list)


@router.get("/course-profiles", response_model=list[RaceCourseProfileResponse])
def read_course_profiles(principal: AuthenticatedPrincipal = Depends(require_roles("coach"))) -> list[RaceCourseProfileResponse]:
    return [RaceCourseProfileResponse.model_validate(profile) for profile in list_course_profiles()]


@router.get("/course-profiles/{course_slug}", response_model=RaceCourseProfileResponse)
def read_course_profile(course_slug: str) -> RaceCourseProfileResponse:
    try:
        profile = get_course_profile(course_slug)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return RaceCourseProfileResponse.model_validate(profile)


@router.post("/simulate", response_model=RaceSimulationResponse)
def simulate(payload: RaceSimulationRequest, principal: AuthenticatedPrincipal = Depends(require_roles("coach"))) -> RaceSimulationResponse:
    try:
        result = simulate_race_day(
            course_slug=payload.course_slug,
            athlete_metrics=AthleteFitnessMetrics(**payload.athlete_metrics.model_dump()),
            weather_forecast=WeatherForecast(**payload.weather_forecast.model_dump()) if payload.weather_forecast is not None else None,
            course_profile_override=payload.course_profile_override,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    response = RaceSimulationResponse(
        course_profile=result.course_profile,
        athlete_metrics=result.athlete_metrics,
        weather_forecast=result.weather_forecast,
        splits=[
            SplitPredictionResponse(
                discipline=item.discipline,
                distance_meters=item.distance_meters,
                baseline_seconds=item.baseline_seconds,
                predicted_seconds=item.predicted_seconds,
                adjustment_seconds=item.adjustment_seconds,
                adjustment_factors=item.adjustment_factors,
                baseline_time=item.baseline_time,
                predicted_time=item.predicted_time,
            )
            for item in result.splits
        ],
        total_baseline_seconds=result.total_baseline_seconds,
        total_predicted_seconds=result.total_predicted_seconds,
        total_time=result.total_time,
        confidence=result.confidence,
        notes=result.notes,
    )
    return response
