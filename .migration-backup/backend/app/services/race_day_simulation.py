from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class CourseSegment:
    name: str
    discipline: str
    distance_meters: float
    elevation_gain_meters: float | None = None
    notes: str | None = None


@dataclass
class CourseProfile:
    slug: str
    name: str
    venue: str
    swim_distance_meters: float
    bike_distance_km: float
    run_distance_km: float
    swim_open_water_penalty: float = 0.03
    bike_elevation_gain_meters: float = 0.0
    run_elevation_gain_meters: float = 0.0
    bike_exposure_factor: float = 0.0
    run_heat_exposure_factor: float = 0.0
    transition_seconds: int = 240
    segments: list[CourseSegment] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    source: str = "embedded-profile"


@dataclass
class WeatherForecast:
    air_temp_c: float | None = None
    water_temp_c: float | None = None
    wind_speed_kph: float | None = None
    wind_gust_kph: float | None = None
    humidity_percent: float | None = None
    cloud_cover_percent: float | None = None
    precipitation_mm: float | None = None
    precipitation_probability_percent: float | None = None


@dataclass
class AthleteFitnessMetrics:
    swim_css_seconds_per_100m: float | None = None
    bike_ftp_watts: float | None = None
    body_mass_kg: float | None = None
    run_threshold_pace_seconds_per_km: float | None = None
    historical_aerobic_efficiency: float | None = None
    swim_aerobic_efficiency: float | None = None
    bike_aerobic_efficiency: float | None = None
    run_aerobic_efficiency: float | None = None
    fatigue_index: float | None = None
    current_fitness_score: float | None = None


@dataclass
class SplitPrediction:
    discipline: str
    distance_meters: float
    baseline_seconds: int
    predicted_seconds: int
    adjustment_seconds: int
    adjustment_factors: list[str] = field(default_factory=list)

    @property
    def predicted_time(self) -> str:
        return _format_duration(self.predicted_seconds)

    @property
    def baseline_time(self) -> str:
        return _format_duration(self.baseline_seconds)


@dataclass
class RaceSimulationResult:
    course_profile: dict[str, Any]
    athlete_metrics: dict[str, Any]
    weather_forecast: dict[str, Any]
    splits: list[SplitPrediction]
    total_baseline_seconds: int
    total_predicted_seconds: int
    total_time: str
    confidence: float
    notes: list[str] = field(default_factory=list)


COURSE_PROFILES: dict[str, CourseProfile] = {
    "ironman-70.3-eagleman": CourseProfile(
        slug="ironman-70.3-eagleman",
        name="Ironman 70.3 Eagleman",
        venue="Cambridge, Maryland, USA",
        swim_distance_meters=1900,
        bike_distance_km=90.1,
        run_distance_km=21.1,
        swim_open_water_penalty=0.035,
        bike_elevation_gain_meters=90,
        run_elevation_gain_meters=20,
        bike_exposure_factor=0.92,
        run_heat_exposure_factor=0.76,
        transition_seconds=300,
        segments=[
            CourseSegment(
                name="Swim",
                discipline="swim",
                distance_meters=1900,
                notes="Open-water river swim with potential current and navigation effects.",
            ),
            CourseSegment(
                name="Bike",
                discipline="bike",
                distance_meters=90100,
                elevation_gain_meters=90,
                notes="Flat and exposed; wind is often the main course variable.",
            ),
            CourseSegment(
                name="Run",
                discipline="run",
                distance_meters=21100,
                elevation_gain_meters=20,
                notes="Predominantly flat, but heat and humidity can be decisive.",
            ),
        ],
        notes=[
            "Designed for fast racing when conditions are calm.",
            "Wind and heat can create substantial split variance.",
        ],
    ),
}


class RaceDaySimulationService:
    def list_course_profiles(self) -> list[dict[str, Any]]:
        return [self._serialize_course_profile(profile) for profile in COURSE_PROFILES.values()]

    def get_course_profile(self, course_slug: str) -> dict[str, Any]:
        profile = COURSE_PROFILES.get(course_slug.strip().lower())
        if profile is None:
            raise LookupError(f"Course profile {course_slug} was not found")
        return self._serialize_course_profile(profile)

    def simulate_race(
        self,
        *,
        course_slug: str,
        athlete_metrics: AthleteFitnessMetrics,
        weather_forecast: WeatherForecast | None = None,
        course_profile_override: dict[str, Any] | None = None,
    ) -> RaceSimulationResult:
        if course_profile_override is not None:
            profile = self._deserialize_course_profile(course_profile_override)
        else:
            profile = COURSE_PROFILES.get(course_slug.strip().lower())
            if profile is None:
                raise LookupError(f"Course profile {course_slug} was not found")

        weather = weather_forecast or WeatherForecast()
        notes: list[str] = []
        splits: list[SplitPrediction] = []

        swim_split, swim_note = self._predict_swim_split(profile, athlete_metrics, weather)
        bike_split, bike_note = self._predict_bike_split(profile, athlete_metrics, weather, swim_split.predicted_seconds)
        run_split, run_note = self._predict_run_split(profile, athlete_metrics, weather, bike_split.predicted_seconds)

        splits.extend([swim_split, bike_split, run_split])
        notes.extend([swim_note, bike_note, run_note])
        notes.extend(self._build_context_notes(profile, weather, athlete_metrics))

        total_baseline = sum(item.baseline_seconds for item in splits) + profile.transition_seconds
        total_predicted = sum(item.predicted_seconds for item in splits) + profile.transition_seconds
        confidence = self._compute_confidence(athlete_metrics, weather)

        return RaceSimulationResult(
            course_profile=self._serialize_course_profile(profile),
            athlete_metrics=self._serialize_athlete_metrics(athlete_metrics),
            weather_forecast=self._serialize_weather(weather),
            splits=splits,
            total_baseline_seconds=total_baseline,
            total_predicted_seconds=total_predicted,
            total_time=_format_duration(total_predicted),
            confidence=confidence,
            notes=notes,
        )

    def _predict_swim_split(
        self,
        profile: CourseProfile,
        metrics: AthleteFitnessMetrics,
        weather: WeatherForecast,
    ) -> tuple[SplitPrediction, str]:
        css = max(60.0, metrics.swim_css_seconds_per_100m or 110.0)
        swim_efficiency = _resolve_efficiency(metrics.swim_aerobic_efficiency, metrics.historical_aerobic_efficiency)
        water_temp = weather.water_temp_c if weather.water_temp_c is not None else 22.0
        cold_water_penalty = max(0.0, (20.0 - water_temp) * 0.0015)
        course_penalty = profile.swim_open_water_penalty
        efficiency_bonus = (swim_efficiency - 50.0) * 0.0018
        fitness_bonus = ((metrics.current_fitness_score if metrics.current_fitness_score is not None else 50.0) - 50.0) * 0.0010
        wind_penalty = 0.0
        if weather.wind_speed_kph is not None:
            wind_penalty = min(0.02, weather.wind_speed_kph / 1000.0)

        multiplier = max(0.88, 1.0 + course_penalty + cold_water_penalty + wind_penalty - efficiency_bonus - fitness_bonus)
        baseline_seconds = round((profile.swim_distance_meters / 100.0) * css)
        predicted_seconds = round(baseline_seconds * multiplier)
        return (
            SplitPrediction(
                discipline="swim",
                distance_meters=profile.swim_distance_meters,
                baseline_seconds=baseline_seconds,
                predicted_seconds=predicted_seconds,
                adjustment_seconds=predicted_seconds - baseline_seconds,
                adjustment_factors=[
                    f"open-water penalty {course_penalty:.1%}",
                    f"water temperature penalty {cold_water_penalty:.1%}" if cold_water_penalty else "water temperature neutral",
                    f"swim efficiency bonus {efficiency_bonus:.1%}",
                    f"current fitness bonus {fitness_bonus:.1%}" if fitness_bonus else "current fitness neutral",
                ],
            ),
            "Swim split reflects open-water navigation and water temperature.",
        )

    def _predict_bike_split(
        self,
        profile: CourseProfile,
        metrics: AthleteFitnessMetrics,
        weather: WeatherForecast,
        swim_seconds: int,
    ) -> tuple[SplitPrediction, str]:
        ftp = max(120.0, metrics.bike_ftp_watts or 220.0)
        body_mass = max(45.0, metrics.body_mass_kg or 70.0)
        bike_efficiency = _resolve_efficiency(metrics.bike_aerobic_efficiency, metrics.historical_aerobic_efficiency)
        wkg = ftp / body_mass
        base_speed_kph = max(20.0, min(45.0, 17.8 + (wkg * 4.1)))

        wind_speed = weather.wind_speed_kph or 0.0
        wind_penalty = min(0.12, (wind_speed / 40.0) * profile.bike_exposure_factor * 0.12)
        elevation_penalty = min(0.08, (profile.bike_elevation_gain_meters / 1000.0) * 0.03)
        heat_penalty = 0.0
        if weather.air_temp_c is not None:
            heat_penalty = max(0.0, (weather.air_temp_c - 22.0) * 0.003)
        efficiency_bonus = (bike_efficiency - 50.0) * 0.0015
        fitness_bonus = ((metrics.current_fitness_score if metrics.current_fitness_score is not None else 50.0) - 50.0) * 0.0008

        transition_penalty = 0.01 if swim_seconds >= 1260 else 0.0
        speed_multiplier = max(0.72, 1.0 - wind_penalty - elevation_penalty - heat_penalty - transition_penalty + efficiency_bonus + fitness_bonus)
        predicted_speed_kph = max(20.0, min(43.0, base_speed_kph * speed_multiplier))
        baseline_seconds = round((profile.bike_distance_km / base_speed_kph) * 3600.0)
        predicted_seconds = round((profile.bike_distance_km / predicted_speed_kph) * 3600.0)

        adjustment_factors = [
            f"FTP-derived baseline {base_speed_kph:.1f} kph",
            f"wind penalty {wind_penalty:.1%}",
            f"elevation penalty {elevation_penalty:.1%}",
            f"heat penalty {heat_penalty:.1%}" if heat_penalty else "temperature neutral",
            f"bike efficiency bonus {efficiency_bonus:.1%}",
            f"current fitness bonus {fitness_bonus:.1%}" if fitness_bonus else "current fitness neutral",
        ]
        if swim_seconds >= 1260:
            adjustment_factors.append("swim-to-bike transition fatigue increases bike softness")
        return (
            SplitPrediction(
                discipline="bike",
                distance_meters=profile.bike_distance_km * 1000.0,
                baseline_seconds=baseline_seconds,
                predicted_seconds=predicted_seconds,
                adjustment_seconds=predicted_seconds - baseline_seconds,
                adjustment_factors=adjustment_factors,
            ),
            "Bike split is driven by FTP, body mass, wind exposure, and aero efficiency.",
        )

    def _predict_run_split(
        self,
        profile: CourseProfile,
        metrics: AthleteFitnessMetrics,
        weather: WeatherForecast,
        bike_seconds: int,
    ) -> tuple[SplitPrediction, str]:
        threshold_pace = max(180.0, metrics.run_threshold_pace_seconds_per_km or 300.0)
        run_efficiency = _resolve_efficiency(metrics.run_aerobic_efficiency, metrics.historical_aerobic_efficiency)
        fatigue_index = _clamp((metrics.fatigue_index or 20.0) / 100.0, 0.0, 1.0)
        bike_load_hours = bike_seconds / 3600.0
        bike_load_penalty = min(0.10, max(0.0, (bike_load_hours - 2.2) * 0.03))

        heat_penalty = 0.0
        humidity_penalty = 0.0
        if weather.air_temp_c is not None:
            heat_penalty = max(0.0, (weather.air_temp_c - 18.0) * 0.006)
        if weather.humidity_percent is not None:
            humidity_penalty = max(0.0, (weather.humidity_percent - 70.0) * 0.0012)

        course_penalty = min(0.06, (profile.run_heat_exposure_factor * 0.02) + (profile.run_elevation_gain_meters / 1000.0) * 0.02)
        efficiency_bonus = (run_efficiency - 50.0) * 0.0015
        fitness_bonus = ((metrics.current_fitness_score if metrics.current_fitness_score is not None else 50.0) - 50.0) * 0.0009
        fatigue_penalty = fatigue_index * 0.08 + bike_load_penalty

        pace_multiplier = max(0.84, 1.0 + fatigue_penalty + heat_penalty + humidity_penalty + course_penalty - efficiency_bonus - fitness_bonus)
        predicted_pace = threshold_pace * pace_multiplier
        baseline_seconds = round((profile.run_distance_km * threshold_pace))
        predicted_seconds = round(profile.run_distance_km * predicted_pace)

        return (
            SplitPrediction(
                discipline="run",
                distance_meters=profile.run_distance_km * 1000.0,
                baseline_seconds=baseline_seconds,
                predicted_seconds=predicted_seconds,
                adjustment_seconds=predicted_seconds - baseline_seconds,
                adjustment_factors=[
                    f"threshold pace baseline {threshold_pace:.0f} sec/km",
                    f"fatigue penalty {fatigue_penalty:.1%}",
                    f"bike load penalty {bike_load_penalty:.1%}",
                    f"heat penalty {heat_penalty:.1%}" if heat_penalty else "temperature neutral",
                    f"humidity penalty {humidity_penalty:.1%}" if humidity_penalty else "humidity neutral",
                    f"run efficiency bonus {efficiency_bonus:.1%}",
                    f"current fitness bonus {fitness_bonus:.1%}" if fitness_bonus else "current fitness neutral",
                ],
            ),
            "Run split reflects bike fatigue, heat, humidity, and historical aerobic efficiency.",
        )

    def _compute_confidence(self, metrics: AthleteFitnessMetrics, weather: WeatherForecast) -> float:
        populated_metrics = sum(
            1
            for value in (
                metrics.swim_css_seconds_per_100m,
                metrics.bike_ftp_watts,
                metrics.body_mass_kg,
                metrics.run_threshold_pace_seconds_per_km,
                metrics.historical_aerobic_efficiency,
                metrics.swim_aerobic_efficiency,
                metrics.bike_aerobic_efficiency,
                metrics.run_aerobic_efficiency,
                metrics.fatigue_index,
            )
            if value is not None
        )
        populated_weather = sum(
            1
            for value in (
                weather.air_temp_c,
                weather.water_temp_c,
                weather.wind_speed_kph,
                weather.humidity_percent,
            )
            if value is not None
        )
        confidence = 0.42 + (populated_metrics * 0.05) + (populated_weather * 0.03)
        return round(_clamp(confidence, 0.35, 0.95), 2)

    def _build_context_notes(
        self,
        profile: CourseProfile,
        weather: WeatherForecast,
        metrics: AthleteFitnessMetrics,
    ) -> list[str]:
        notes = list(profile.notes)
        if weather.air_temp_c is not None and weather.air_temp_c >= 24.0:
            notes.append("High air temperature will meaningfully pressure the run split.")
        if weather.wind_speed_kph is not None and weather.wind_speed_kph >= 18.0:
            notes.append("Wind is likely to influence the bike split more than the swim or run.")
        if metrics.historical_aerobic_efficiency is None:
            notes.append("Historical aerobic efficiency was not provided, so the model leans on current fitness metrics.")
        return notes

    def _serialize_course_profile(self, profile: CourseProfile) -> dict[str, Any]:
        return asdict(profile)

    def _deserialize_course_profile(self, profile: dict[str, Any]) -> CourseProfile:
        segments = [CourseSegment(**segment) for segment in profile.get("segments", []) if isinstance(segment, dict)]
        return CourseProfile(
            slug=str(profile.get("slug") or "").strip().lower(),
            name=str(profile.get("name") or "").strip(),
            venue=str(profile.get("venue") or "").strip(),
            swim_distance_meters=float(profile.get("swim_distance_meters") or 0.0),
            bike_distance_km=float(profile.get("bike_distance_km") or 0.0),
            run_distance_km=float(profile.get("run_distance_km") or 0.0),
            swim_open_water_penalty=float(profile.get("swim_open_water_penalty") or 0.0),
            bike_elevation_gain_meters=float(profile.get("bike_elevation_gain_meters") or 0.0),
            run_elevation_gain_meters=float(profile.get("run_elevation_gain_meters") or 0.0),
            bike_exposure_factor=float(profile.get("bike_exposure_factor") or 0.0),
            run_heat_exposure_factor=float(profile.get("run_heat_exposure_factor") or 0.0),
            transition_seconds=int(profile.get("transition_seconds") or 0),
            segments=segments,
            notes=[str(item) for item in profile.get("notes", []) if item],
            source=str(profile.get("source") or "embedded-profile"),
        )

    def _serialize_athlete_metrics(self, metrics: AthleteFitnessMetrics) -> dict[str, Any]:
        return asdict(metrics)

    def _serialize_weather(self, weather: WeatherForecast) -> dict[str, Any]:
        return asdict(weather)


def list_course_profiles() -> list[dict[str, Any]]:
    return RaceDaySimulationService().list_course_profiles()


def get_course_profile(course_slug: str) -> dict[str, Any]:
    return RaceDaySimulationService().get_course_profile(course_slug)


def simulate_race_day(
    *,
    course_slug: str,
    athlete_metrics: AthleteFitnessMetrics,
    weather_forecast: WeatherForecast | None = None,
    course_profile_override: dict[str, Any] | None = None,
) -> RaceSimulationResult:
    return RaceDaySimulationService().simulate_race(
        course_slug=course_slug,
        athlete_metrics=athlete_metrics,
        weather_forecast=weather_forecast,
        course_profile_override=course_profile_override,
    )


def _resolve_efficiency(value: float | None, fallback: float | None) -> float:
    resolved = value if value is not None else fallback if fallback is not None else 50.0
    return _clamp(float(resolved), 0.0, 100.0)


def _clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))


def _format_duration(total_seconds: int) -> str:
    total_seconds = max(0, int(round(total_seconds)))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
