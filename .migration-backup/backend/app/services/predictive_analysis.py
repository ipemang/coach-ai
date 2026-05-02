from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlencode
from urllib.request import urlopen

from app.services.athlete_memory_search import AthleteMemorySearchService
from app.services.scope import DataScope

PredictedStatePriority = Literal["high", "medium", "low"]


@dataclass(slots=True)
class WeatherObservation:
    temperature_c: float | None = None
    humidity_percent: float | None = None
    observed_at: str | None = None
    source: str = "open-meteo"
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class PredictedStateFlag:
    code: str
    label: str
    priority: PredictedStatePriority
    score: float
    confidence: float
    reason: str
    evidence: list[str] = field(default_factory=list)
    weather_adjusted: bool = False


@dataclass(slots=True)
class PredictedStateAnalysis:
    athlete_id: str
    athlete_name: str | None
    latest_memory_state_id: str | None
    latest_memory_state_at: str | None
    summary: str | None
    flags: list[PredictedStateFlag] = field(default_factory=list)
    memory_context: str = ""
    memory_results: list[dict[str, Any]] = field(default_factory=list)
    weather_context: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class _ActivitySignal:
    row: dict[str, Any]
    row_id: str | None
    timestamp: datetime
    activity_kind: str
    heart_rate_bpm: float | None
    output_value: float | None
    efficiency_index: float | None
    weather_adjusted_efficiency: float | None
    weather: WeatherObservation | None
    notes: list[str] = field(default_factory=list)


class OpenMeteoWeatherService:
    def __init__(self) -> None:
        self._cache: dict[tuple[float, float, str], WeatherObservation | None] = {}

    def fetch_observation(self, latitude: float, longitude: float, at: datetime) -> WeatherObservation | None:
        timestamp = _ensure_utc(at)
        cache_key = (round(latitude, 3), round(longitude, 3), timestamp.replace(minute=0, second=0, microsecond=0).isoformat())
        if cache_key in self._cache:
            return self._cache[cache_key]

        url = "https://archive-api.open-meteo.com/v1/archive?" + urlencode(
            {
                "latitude": latitude,
                "longitude": longitude,
                "start_date": timestamp.date().isoformat(),
                "end_date": timestamp.date().isoformat(),
                "hourly": "temperature_2m,relative_humidity_2m",
                "timezone": "UTC",
            }
        )

        try:
            with urlopen(url, timeout=20) as response:
                payload = response.read().decode("utf-8")
        except Exception:
            self._cache[cache_key] = None
            return None

        try:
            import json

            data = json.loads(payload)
        except Exception:
            self._cache[cache_key] = None
            return None

        hourly = data.get("hourly") if isinstance(data, dict) else None
        if not isinstance(hourly, dict):
            self._cache[cache_key] = None
            return None

        times = hourly.get("time") or []
        temperatures = hourly.get("temperature_2m") or []
        humidities = hourly.get("relative_humidity_2m") or []
        if not isinstance(times, list):
            self._cache[cache_key] = None
            return None

        target_hour = timestamp.replace(minute=0, second=0, microsecond=0)
        best_index: int | None = None
        best_distance: int | None = None
        for index, value in enumerate(times):
            parsed = _parse_datetime(value)
            if parsed is None:
                continue
            distance = abs(int((parsed - target_hour).total_seconds()))
            if best_distance is None or distance < best_distance:
                best_distance = distance
                best_index = index

        if best_index is None:
            self._cache[cache_key] = None
            return None

        observation = WeatherObservation(
            temperature_c=_float_or_none(temperatures[best_index]) if best_index < len(temperatures) else None,
            humidity_percent=_float_or_none(humidities[best_index]) if best_index < len(humidities) else None,
            observed_at=str(times[best_index]),
            raw={"hourly": hourly},
        )
        self._cache[cache_key] = observation
        return observation


class PredictiveAnalysisService:
    def __init__(
        self,
        supabase_client: Any,
        *,
        memory_search_service: AthleteMemorySearchService | None = None,
        weather_service: OpenMeteoWeatherService | None = None,
        memory_states_table: str = "memory_states",
        scope: DataScope | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.memory_states_table = memory_states_table
        self.scope = scope
        self.memory_search_service = memory_search_service or AthleteMemorySearchService(
            supabase_client=supabase_client,
            memory_states_table=memory_states_table,
            scope=scope,
        )
        self.weather_service = weather_service or OpenMeteoWeatherService()

    async def analyze_athlete(self, athlete_id: str, rows: list[dict[str, Any]], *, now: datetime | None = None) -> PredictedStateAnalysis:
        if not rows:
            return PredictedStateAnalysis(
                athlete_id=athlete_id,
                athlete_name=None,
                latest_memory_state_id=None,
                latest_memory_state_at=None,
                summary=None,
            )

        resolved_now = _ensure_utc(now or datetime.now(timezone.utc))
        sorted_rows = sorted(rows, key=lambda row: _row_datetime(row, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day")), reverse=True)
        latest_row = sorted_rows[0]
        athlete_name = _string_value(
            latest_row.get("athlete_display_name")
            or latest_row.get("athlete_name")
            or latest_row.get("display_name")
            or latest_row.get("name")
        )

        memory_results, memory_context = await self.memory_search_service.build_context(
            query=f"{athlete_name or athlete_id} sleep hrv soreness fatigue mood aerobic efficiency pace power heart rate overtraining injury",
            athlete_id=athlete_id,
            limit=5,
        )

        signals = self._extract_signals(sorted_rows)
        flags = self._score_flags(signals=signals, memory_context=memory_context, memory_results=memory_results, now=resolved_now)
        summary = self._summarize(flags)
        latest_at = _row_datetime(latest_row, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day"))

        return PredictedStateAnalysis(
            athlete_id=athlete_id,
            athlete_name=athlete_name,
            latest_memory_state_id=_string_value(latest_row.get("id") or latest_row.get("memory_state_id")),
            latest_memory_state_at=latest_at.isoformat() if latest_at != datetime.min.replace(tzinfo=timezone.utc) else None,
            summary=summary,
            flags=flags,
            memory_context=memory_context,
            memory_results=[result.memory_state for result in memory_results],
            weather_context={
                signal.row_id or signal.timestamp.isoformat(): {
                    "temperature_c": signal.weather.temperature_c if signal.weather else None,
                    "humidity_percent": signal.weather.humidity_percent if signal.weather else None,
                    "observed_at": signal.weather.observed_at if signal.weather else None,
                    "weather_adjusted_efficiency": signal.weather_adjusted_efficiency,
                }
                for signal in signals
                if signal.weather is not None or signal.weather_adjusted_efficiency is not None
            },
        )

    def _extract_signals(self, rows: list[dict[str, Any]]) -> list[_ActivitySignal]:
        signals: list[_ActivitySignal] = []
        for row in rows:
            timestamp = _row_datetime(row, ("started_at", "timestamp", "measured_at", "recorded_at", "updated_at", "created_at", "day"))
            row_id = _string_value(row.get("id") or row.get("memory_state_id"))
            heart_rate_bpm = _first_float(row, (
                "avg_hr_bpm",
                "average_hr_bpm",
                "avg_heart_rate",
                "avg_heart_rate_bpm",
                "heart_rate",
                "hr_bpm",
                "hr",
            ))
            output_value, activity_kind = self._extract_output(row)
            weather = self._fetch_weather(row, timestamp)
            efficiency_index = None
            weather_adjusted_efficiency = None
            notes: list[str] = []

            if output_value is not None and heart_rate_bpm and heart_rate_bpm > 0:
                efficiency_index = output_value / heart_rate_bpm
                weather_adjusted_efficiency = _normalize_for_weather(efficiency_index, weather)
                if weather is not None:
                    notes.append(_weather_note(weather))

            signal = _ActivitySignal(
                row=row,
                row_id=row_id,
                timestamp=timestamp,
                activity_kind=activity_kind,
                heart_rate_bpm=heart_rate_bpm,
                output_value=output_value,
                efficiency_index=efficiency_index,
                weather_adjusted_efficiency=weather_adjusted_efficiency,
                weather=weather,
                notes=notes,
            )
            signals.append(signal)
        return signals

    def _fetch_weather(self, row: dict[str, Any], timestamp: datetime) -> WeatherObservation | None:
        latitude = _first_float(row, ("latitude", "lat", "activity_latitude", "location_latitude", "geo_lat"))
        longitude = _first_float(row, ("longitude", "lon", "lng", "activity_longitude", "location_longitude", "geo_lon"))
        if latitude is None or longitude is None:
            nested_location = _find_nested_dict(row, ("location", "geo", "coordinates", "activity_location"))
            if isinstance(nested_location, dict):
                latitude = _first_float(nested_location, ("latitude", "lat", "y"))
                longitude = _first_float(nested_location, ("longitude", "lon", "lng", "x"))
        if latitude is None or longitude is None:
            return None
        return self.weather_service.fetch_observation(latitude, longitude, timestamp)

    def _extract_output(self, row: dict[str, Any]) -> tuple[float | None, str]:
        power = _first_float(row, (
            "avg_power_watts",
            "average_power_watts",
            "avg_power",
            "normalized_power",
            "power_watts",
            "power",
            "watts",
        ))
        if power is not None:
            return power, "power"

        pace_seconds = _first_float(row, (
            "pace_seconds_per_km",
            "avg_pace_seconds_per_km",
            "pace_sec_per_km",
            "pace_sec_km",
        ))
        if pace_seconds and pace_seconds > 0:
            return 1000.0 / pace_seconds, "pace"

        pace_minutes = _first_float(row, ("pace_min_per_km", "avg_pace_min_per_km"))
        if pace_minutes and pace_minutes > 0:
            return 1000.0 / (pace_minutes * 60.0), "pace"

        distance_meters = _first_float(row, ("distance_meters", "distance", "moving_distance_meters"))
        duration_seconds = _first_float(row, (
            "moving_time_seconds",
            "moving_time",
            "elapsed_time_seconds",
            "elapsed_time",
            "duration_seconds",
        ))
        if distance_meters is not None and duration_seconds is not None and duration_seconds > 0:
            return distance_meters / duration_seconds, "pace"

        speed_mps = _first_float(row, ("speed_mps", "avg_speed_mps", "average_speed_mps"))
        if speed_mps is not None:
            return speed_mps, "pace"

        return None, "unknown"

    def _score_flags(
        self,
        *,
        signals: list[_ActivitySignal],
        memory_context: str,
        memory_results: list[Any],
        now: datetime,
    ) -> list[PredictedStateFlag]:
        flags: list[PredictedStateFlag] = []
        if not signals:
            return flags

        latest = signals[0]
        comparable = [signal for signal in signals[1:] if signal.activity_kind == latest.activity_kind and signal.efficiency_index is not None and signal.heart_rate_bpm is not None]
        latest_efficiency = latest.weather_adjusted_efficiency or latest.efficiency_index

        if latest_efficiency is not None and latest.heart_rate_bpm is not None and comparable:
            baseline_efficiency = _median([signal.weather_adjusted_efficiency or signal.efficiency_index for signal in comparable if (signal.weather_adjusted_efficiency or signal.efficiency_index) is not None])
            baseline_hr = _median([signal.heart_rate_bpm for signal in comparable if signal.heart_rate_bpm is not None])
            if baseline_efficiency is not None and baseline_hr is not None:
                drop_pct = max(0.0, (baseline_efficiency - latest_efficiency) / max(0.0001, baseline_efficiency))
                hr_delta = latest.heart_rate_bpm - baseline_hr
                output_delta = None
                if latest.output_value is not None:
                    baseline_output = _median([signal.output_value for signal in comparable if signal.output_value is not None])
                    if baseline_output is not None:
                        output_delta = latest.output_value - baseline_output
                if drop_pct >= 0.08 and hr_delta >= 3.0 and (output_delta is None or output_delta <= 0.0):
                    flags.append(
                        PredictedStateFlag(
                            code="aerobic_efficiency_drop",
                            label="Aerobic efficiency drop",
                            priority="high",
                            score=min(100.0, 70.0 + drop_pct * 200.0 + max(0.0, hr_delta) * 2.0),
                            confidence=min(0.98, 0.55 + min(0.35, len(comparable) * 0.05)),
                            reason=(
                                "Athlete is producing the same or lower pace/power with a higher heart rate after weather normalization."
                            ),
                            evidence=self._aerobic_evidence(latest, baseline_efficiency, baseline_hr, drop_pct, hr_delta),
                            weather_adjusted=True,
                        )
                    )

        trend_inputs = self._trend_inputs(signals)
        hrv_trend = trend_inputs.get("hrv_ms")
        resting_hr_trend = trend_inputs.get("resting_hr_bpm")
        sleep_trend = trend_inputs.get("sleep_hours")
        soreness_trend = trend_inputs.get("soreness")
        mood_trend = trend_inputs.get("mood")
        fatigue_trend = trend_inputs.get("fatigue")

        overtraining_score = 0.0
        overtraining_evidence: list[str] = []
        if hrv_trend is not None and hrv_trend.get("latest_delta_pct", 0.0) <= -0.10:
            overtraining_score += 22.0
            overtraining_evidence.append(hrv_trend["text"])
        if resting_hr_trend is not None and resting_hr_trend.get("latest_delta", 0.0) >= 4.0:
            overtraining_score += 18.0
            overtraining_evidence.append(resting_hr_trend["text"])
        if sleep_trend is not None and sleep_trend.get("latest_value", 0.0) < 7.0:
            overtraining_score += 15.0
            overtraining_evidence.append(sleep_trend["text"])
        if fatigue_trend is not None and fatigue_trend.get("latest_value", 0.0) >= 7.0:
            overtraining_score += 16.0
            overtraining_evidence.append(fatigue_trend["text"])
        if mood_trend is not None and mood_trend.get("latest_value", 10.0) <= 4.0:
            overtraining_score += 10.0
            overtraining_evidence.append(mood_trend["text"])
        if soreness_trend is not None and soreness_trend.get("latest_value", 0.0) >= 7.0:
            overtraining_score += 12.0
            overtraining_evidence.append(soreness_trend["text"])

        if overtraining_score >= 25.0:
            flags.append(
                PredictedStateFlag(
                    code="overtraining_precursor",
                    label="Overtraining precursor",
                    priority="medium" if overtraining_score < 35.0 else "high",
                    score=min(100.0, overtraining_score + 20.0),
                    confidence=min(0.95, 0.45 + len(overtraining_evidence) * 0.1),
                    reason="Multiple recovery signals are drifting in the wrong direction and warrant close monitoring.",
                    evidence=overtraining_evidence,
                )
            )

        injury_evidence: list[str] = []
        injury_score = 0.0
        if soreness_trend is not None and soreness_trend.get("trend", 0.0) > 0.0:
            injury_score += 18.0
            injury_evidence.append(soreness_trend["text"])
        if latest.activity_kind == "power" and latest_efficiency is not None and comparable:
            baseline_efficiency = _median([signal.weather_adjusted_efficiency or signal.efficiency_index for signal in comparable if (signal.weather_adjusted_efficiency or signal.efficiency_index) is not None])
            if baseline_efficiency is not None and latest_efficiency < baseline_efficiency * 0.9:
                injury_score += 12.0
                injury_evidence.append("Performance is down materially against recent history.")
        if _memory_mentions_injury(memory_context, memory_results):
            injury_score += 12.0
            injury_evidence.append("Recent athlete memory includes injury or pain references.")
        if injury_score >= 20.0:
            flags.append(
                PredictedStateFlag(
                    code="injury_precursor",
                    label="Injury precursor",
                    priority="medium",
                    score=min(100.0, injury_score + 10.0),
                    confidence=min(0.9, 0.4 + len(injury_evidence) * 0.12),
                    reason="Recovered workload is deteriorating alongside soreness or pain markers.",
                    evidence=injury_evidence,
                )
            )

        flags.sort(key=lambda item: (-_priority_rank(item.priority), -item.score, item.code))
        return flags

    def _trend_inputs(self, signals: list[_ActivitySignal]) -> dict[str, dict[str, Any] | None]:
        trend_fields = (
            ("hrv_ms", ("hrv_ms", "hrv")),
            ("resting_hr_bpm", ("resting_hr_bpm", "resting_hr")),
            ("sleep_hours", ("sleep_hours", "sleep_duration_hours", "sleep_duration")),
            ("soreness", ("soreness", "soreness_score")),
            ("mood", ("mood", "mood_score")),
            ("fatigue", ("fatigue", "fatigue_score")),
        )
        result: dict[str, dict[str, Any] | None] = {}
        for name, keys in trend_fields:
            values: list[float] = []
            for signal in signals:
                number = _first_float(signal.row, keys)
                if number is not None:
                    values.append(number)
            if not values:
                result[name] = None
                continue
            latest_value = values[0]
            baseline = _median(values[1:]) if len(values) > 1 else values[0]
            trend = latest_value - (baseline if baseline is not None else latest_value)
            latest_delta_pct = None
            if baseline not in (None, 0):
                latest_delta_pct = (latest_value - baseline) / abs(baseline)
            result[name] = {
                "latest_value": latest_value,
                "baseline": baseline,
                "trend": trend,
                "latest_delta": trend,
                "latest_delta_pct": latest_delta_pct,
                "text": f"{name.replace('_', ' ').title()} is {latest_value:g} vs baseline {baseline:g}" if baseline is not None else f"{name.replace('_', ' ').title()} is {latest_value:g}",
            }
        return result

    def _aerobic_evidence(
        self,
        latest: _ActivitySignal,
        baseline_efficiency: float,
        baseline_hr: float,
        drop_pct: float,
        hr_delta: float,
    ) -> list[str]:
        evidence = [
            f"Baseline efficiency {baseline_efficiency:.3f}",
            f"Latest efficiency {(latest.weather_adjusted_efficiency or latest.efficiency_index or 0.0):.3f}",
            f"Heart rate is {hr_delta:.1f} bpm above the recent baseline",
            f"Weather-adjusted efficiency dropped {drop_pct * 100:.1f}%",
        ]
        if latest.weather is not None:
            evidence.append(_weather_note(latest.weather))
        return evidence

    def _summarize(self, flags: list[PredictedStateFlag]) -> str | None:
        if not flags:
            return None
        top_flag = flags[0]
        return f"{top_flag.label}: {top_flag.reason}"


def _priority_rank(priority: PredictedStatePriority) -> int:
    return {"high": 3, "medium": 2, "low": 1}[priority]


def _memory_mentions_injury(memory_context: str, memory_results: list[Any]) -> bool:
    lowered = memory_context.lower()
    injury_terms = ("injury", "pain", "soreness", "tight", "achilles", "knee", "hamstring", "shin", "calf", "strain")
    if any(term in lowered for term in injury_terms):
        return True
    for item in memory_results:
        if isinstance(item, dict):
            text = " ".join(str(value) for value in item.values() if value is not None).lower()
            if any(term in text for term in injury_terms):
                return True
    return False


def _normalize_for_weather(efficiency: float, weather: WeatherObservation | None) -> float:
    if weather is None:
        return efficiency
    temp = weather.temperature_c
    humidity = weather.humidity_percent
    penalty = 1.0
    if temp is not None and temp > 12.0:
        penalty += (temp - 12.0) * 0.012
    if humidity is not None and humidity > 60.0:
        penalty += (humidity - 60.0) * 0.0025
    return efficiency / max(0.75, penalty)


def _weather_note(weather: WeatherObservation) -> str:
    bits: list[str] = []
    if weather.temperature_c is not None:
        bits.append(f"{weather.temperature_c:.1f}°C")
    if weather.humidity_percent is not None:
        bits.append(f"{weather.humidity_percent:.0f}% humidity")
    if not bits:
        return "Weather context unavailable"
    return "Weather context: " + ", ".join(bits)


def _median(values: list[float | None]) -> float | None:
    filtered = sorted(value for value in values if value is not None)
    if not filtered:
        return None
    middle = len(filtered) // 2
    if len(filtered) % 2 == 1:
        return filtered[middle]
    return (filtered[middle - 1] + filtered[middle]) / 2.0


def _find_nested_dict(row: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any] | None:
    for key in keys:
        value = row.get(key)
        if isinstance(value, dict):
            return value
    return None


def _first_float(row: dict[str, Any], keys: tuple[str, ...]) -> float | None:
    for key in keys:
        if key in row:
            value = _float_or_none(row.get(key))
            if value is not None:
                return value
    for nested_key in ("payload", "metrics", "check_in", "details", "raw", "activity", "performance"):
        nested = row.get(nested_key)
        if isinstance(nested, dict):
            value = _first_float(nested, keys)
            if value is not None:
                return value
    return None


def _row_datetime(row: dict[str, Any], keys: tuple[str, ...]) -> datetime:
    for key in keys:
        parsed = _parse_datetime(row.get(key))
        if parsed is not None:
            return parsed
    for nested_key in ("payload", "metrics", "check_in", "details", "raw", "activity", "performance"):
        nested = row.get(nested_key)
        if isinstance(nested, dict):
            parsed = _row_datetime(nested, keys)
            if parsed != datetime.min.replace(tzinfo=timezone.utc):
                return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


def _parse_datetime(value: Any) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return _ensure_utc(value)
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return _ensure_utc(parsed)


def _ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _float_or_none(value: Any) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


__all__ = [
    "OpenMeteoWeatherService",
    "PredictiveAnalysisService",
    "PredictedStateAnalysis",
    "PredictedStateFlag",
    "WeatherObservation",
]
