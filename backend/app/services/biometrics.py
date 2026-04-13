"""Biometric ingestion and synchronization service.

This module keeps the Coach.AI biometric layer modular so provider-specific
transport/auth logic can be swapped in later without changing the service
contract. The normalized dataclasses below give us one shape for Garmin,
Strava, and Oura payloads, while the service keeps the Supabase sync path
isolated.
"""

from __future__ import annotations

import inspect
import logging
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import date, datetime, timezone
from typing import Any, Literal, Protocol

from app.core.cache import JsonCache, build_cache_key

logger = logging.getLogger(__name__)

Provider = Literal["garmin", "strava", "oura"]


class SupabaseClientProtocol(Protocol):
    """Minimal protocol for the Supabase client used by this service."""

    def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


class BiometricsProviderAdapter(Protocol):
    """Provider adapter contract for Garmin, Strava, and Oura integrations.

    Real adapters can live behind this interface and use OAuth tokens,
    service credentials, webhooks, or any future auth flow without requiring
    changes to the orchestration layer.
    """

    provider: Provider

    async def authenticate(self, context: AthleteAuthContext) -> ProviderAuthResult:
        ...

    async def fetch_garmin_workout_summaries(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        ...

    async def fetch_garmin_primary_biometrics(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        ...

    async def fetch_strava_activity_sync(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        ...

    async def fetch_strava_segment_data(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        ...

    async def fetch_oura_readiness(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        ...

    async def fetch_oura_hrv(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        ...

    async def fetch_oura_sleep_quality(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        ...


@dataclass(slots=True)
class AthleteAuthContext:
    """Opaque auth inputs for a specific athlete and provider.

    The exact credential payload will depend on the upstream integration flow
    (OAuth code, refresh token, API key, signed JWT, etc.).
    """

    athlete_id: str
    provider: Provider
    credential_payload: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ProviderAuthResult:
    """Normalized token/session output after authenticating with a provider."""

    provider: Provider
    athlete_id: str
    access_token: str
    refresh_token: str | None = None
    expires_at: datetime | None = None
    provider_user_id: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedGarminWorkoutSummary:
    """Provider-normalized Garmin workout summary for a single session."""

    athlete_id: str
    provider: Provider
    day: date
    workout_id: str | None = None
    activity_type: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration_minutes: int | None = None
    distance_meters: float | None = None
    calories_burned: float | None = None
    avg_hr_bpm: float | None = None
    total_ascent_meters: float | None = None
    training_effect: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedGarminPrimaryBiometrics:
    """Provider-normalized Garmin primary biometrics for a single day."""

    athlete_id: str
    provider: Provider
    day: date
    resting_hr_bpm: float | None = None
    hrv_ms: float | None = None
    stress_score: float | None = None
    body_battery: float | None = None
    training_readiness: float | None = None
    sleep_score: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedStravaActivitySync:
    """Provider-normalized Strava activity sync payload for a single activity."""

    athlete_id: str
    provider: Provider
    day: date
    activity_id: str | None = None
    activity_type: str | None = None
    name: str | None = None
    started_at: datetime | None = None
    moving_time_minutes: int | None = None
    elapsed_time_minutes: int | None = None
    distance_meters: float | None = None
    total_elevation_gain_meters: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedStravaSegmentData:
    """Provider-normalized Strava segment data for a single segment result."""

    athlete_id: str
    provider: Provider
    day: date
    segment_id: str | None = None
    activity_id: str | None = None
    segment_name: str | None = None
    elapsed_time_seconds: float | None = None
    moving_time_seconds: float | None = None
    effort_count: int | None = None
    kom_flag: bool | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedOuraReadiness:
    """Provider-normalized Oura readiness payload for a single day."""

    athlete_id: str
    provider: Provider
    day: date
    readiness_score: float | None = None
    temperature_deviation: float | None = None
    recovery_index: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedOuraHrv:
    """Provider-normalized Oura HRV payload for a single day."""

    athlete_id: str
    provider: Provider
    day: date
    hrv_ms: float | None = None
    hrv_sdnn_ms: float | None = None
    hrv_sample_count: int | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedOuraSleepQuality:
    """Provider-normalized Oura sleep quality payload for a single night."""

    athlete_id: str
    provider: Provider
    day: date
    sleep_score: float | None = None
    sleep_efficiency_percent: float | None = None
    sleep_duration_minutes: int | None = None
    deep_sleep_minutes: int | None = None
    rem_sleep_minutes: int | None = None
    awake_minutes: int | None = None
    resting_hr_bpm: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class BiometricProviderSummary:
    """Normalized provider bundle shared by Garmin, Strava, and Oura."""

    athlete_id: str
    provider: Provider
    day: date
    sections: dict[str, Any] = field(default_factory=dict)
    metrics: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def source_record_ids(self) -> list[str]:
        """Collect source record ids across all normalized provider payloads."""

        source_ids: list[str] = []
        for value in self.sections.values():
            source_ids.extend(_collect_source_record_ids(value))
        return source_ids

    def to_payload(self) -> dict[str, Any]:
        """Convert the summary into a serializable Supabase payload."""

        return {
            "athlete_id": self.athlete_id,
            "provider": self.provider,
            "source_day": self.day.isoformat(),
            "sections": _json_safe(self.sections),
            "metrics": _json_safe(self.metrics),
            "raw": _json_safe(self.raw),
            "source_record_ids": self.source_record_ids,
        }

    def to_internal_state(self) -> InternalBiometricState:
        """Convert the normalized bundle to the internal memory_states shape."""

        return InternalBiometricState(
            athlete_id=self.athlete_id,
            state_date=self.day,
            state_type="biometric",
            provider=self.provider,
            payload=self.to_payload(),
        )


@dataclass(slots=True)
class InternalBiometricState:
    """Internal state shape to persist in memory_states."""

    athlete_id: str
    state_date: date
    state_type: str = "biometric"
    provider: Provider | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_memory_state_row(self) -> dict[str, Any]:
        """Convert the normalized state into a memory_states row payload."""

        return {
            "athlete_id": self.athlete_id,
            "state_type": self.state_type,
            "state_date": self.state_date.isoformat(),
            "provider": self.provider,
            "payload": _json_safe(self.payload),
            "updated_at": self.updated_at.isoformat(),
        }


def _json_safe(value: Any) -> Any:
    """Recursively convert dataclasses, dates, and datetimes into JSON-safe data."""

    if value is None:
        return None
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if is_dataclass(value):
        return {key: _json_safe(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {str(key): _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return value


def _collect_source_record_ids(value: Any) -> list[str]:
    if value is None:
        return []
    if is_dataclass(value):
        return list(getattr(value, "source_record_ids", []) or [])
    if isinstance(value, dict):
        source_ids = list(value.get("source_record_ids") or [])
        for nested_value in value.values():
            source_ids.extend(_collect_source_record_ids(nested_value))
        return source_ids
    if isinstance(value, (list, tuple, set)):
        source_ids: list[str] = []
        for item in value:
            source_ids.extend(_collect_source_record_ids(item))
        return source_ids
    return []


class BiometricsService:
    """Orchestrates provider auth, fetch, normalization, and persistence."""

    def __init__(
        self,
        supabase_client: SupabaseClientProtocol | None = None,
        provider_adapters: dict[Provider, BiometricsProviderAdapter] | None = None,
        cache_client: Any | None = None,
        cache_ttl_seconds: int = 300,
    ) -> None:
        self.supabase_client = supabase_client
        self.provider_adapters = provider_adapters or {}
        self.cache = JsonCache(cache_client, namespace="coach-ai:biometrics", default_ttl_seconds=cache_ttl_seconds)

    def register_provider_adapter(
        self,
        provider: Provider,
        adapter: BiometricsProviderAdapter,
    ) -> None:
        """Register or replace a provider adapter at runtime."""

        self.provider_adapters[provider] = adapter

    def _get_provider_adapter(self, provider: Provider) -> BiometricsProviderAdapter:
        adapter = self.provider_adapters.get(provider)
        if adapter is None:
            raise NotImplementedError(f"No adapter configured for provider: {provider}")
        return adapter

    async def authenticate_athlete(
        self,
        context: AthleteAuthContext,
    ) -> ProviderAuthResult:
        """Authenticate a specific athlete against Garmin, Strava, or Oura."""

        adapter = self._get_provider_adapter(context.provider)
        return await adapter.authenticate(context)

    async def fetch_garmin_workout_summaries(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        """Fetch Garmin workout summaries for the requested day."""

        cache_key = build_cache_key("garmin", "workout_summaries", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "garmin", "lookup": "workout_summaries", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, list) else []

        adapter = self._get_provider_adapter("garmin")
        result = await adapter.fetch_garmin_workout_summaries(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    async def fetch_garmin_primary_biometrics(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        """Fetch Garmin primary biometrics for the requested day."""

        cache_key = build_cache_key("garmin", "primary_biometrics", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "garmin", "lookup": "primary_biometrics", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, dict) else None

        adapter = self._get_provider_adapter("garmin")
        result = await adapter.fetch_garmin_primary_biometrics(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    async def fetch_strava_activity_sync(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        """Fetch Strava activity sync payloads for the requested day."""

        cache_key = build_cache_key("strava", "activity_sync", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "strava", "lookup": "activity_sync", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, list) else []

        adapter = self._get_provider_adapter("strava")
        result = await adapter.fetch_strava_activity_sync(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    async def fetch_strava_segment_data(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        """Fetch Strava segment data for the requested day."""

        cache_key = build_cache_key("strava", "segment_data", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "strava", "lookup": "segment_data", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, list) else []

        adapter = self._get_provider_adapter("strava")
        result = await adapter.fetch_strava_segment_data(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    async def fetch_oura_readiness(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        """Fetch Oura readiness payload for the requested day."""

        cache_key = build_cache_key("oura", "readiness", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "oura", "lookup": "readiness", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, dict) else None

        adapter = self._get_provider_adapter("oura")
        result = await adapter.fetch_oura_readiness(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    async def fetch_oura_hrv(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        """Fetch Oura HRV payload for the requested day."""

        cache_key = build_cache_key("oura", "hrv", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "oura", "lookup": "hrv", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, dict) else None

        adapter = self._get_provider_adapter("oura")
        result = await adapter.fetch_oura_hrv(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    async def fetch_oura_sleep_quality(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any] | None:
        """Fetch Oura sleep quality payload for the requested day."""

        cache_key = build_cache_key("oura", "sleep_quality", athlete_id, day)
        cached = await self.cache.get(cache_key)
        if cached is not None:
            logger.debug("biometric_cache_hit", extra={"provider": "oura", "lookup": "sleep_quality", "athlete_id": athlete_id, "day": day.isoformat()})
            return cached if isinstance(cached, dict) else None

        adapter = self._get_provider_adapter("oura")
        result = await adapter.fetch_oura_sleep_quality(athlete_id, day, auth)
        await self.cache.set(cache_key, result)
        return result

    def normalize_garmin_payload(
        self,
        athlete_id: str,
        day: date,
        workout_summaries: list[dict[str, Any]] | None,
        primary_biometrics: dict[str, Any] | None,
    ) -> BiometricProviderSummary:
        """Normalize Garmin workout summaries and primary biometrics."""

        workout_summaries = workout_summaries or []
        workouts = [
            self._normalize_garmin_workout_summary(athlete_id, day, item)
            for item in workout_summaries
        ]
        biometrics = self._normalize_garmin_primary_biometrics(
            athlete_id,
            day,
            primary_biometrics,
        )

        metrics = {
            "workout_count": len(workouts),
            "workout_minutes": sum(int(item.duration_minutes or 0) for item in workouts),
            "distance_meters": sum(float(item.distance_meters or 0.0) for item in workouts),
            "resting_hr_bpm": biometrics.resting_hr_bpm if biometrics else None,
            "hrv_ms": biometrics.hrv_ms if biometrics else None,
            "training_readiness": biometrics.training_readiness if biometrics else None,
            "sleep_score": biometrics.sleep_score if biometrics else None,
        }

        return BiometricProviderSummary(
            athlete_id=athlete_id,
            provider="garmin",
            day=day,
            sections={
                "workout_summaries": workouts,
                "primary_biometrics": biometrics,
            },
            metrics=metrics,
            raw={
                "workout_summaries": workout_summaries,
                "primary_biometrics": primary_biometrics or {},
            },
        )

    def normalize_strava_payload(
        self,
        athlete_id: str,
        day: date,
        activity_sync: list[dict[str, Any]] | None,
        segment_data: list[dict[str, Any]] | None,
    ) -> BiometricProviderSummary:
        """Normalize Strava activity sync and segment data."""

        activity_sync = activity_sync or []
        segment_data = segment_data or []
        activities = [
            self._normalize_strava_activity_sync(athlete_id, day, item)
            for item in activity_sync
        ]
        segments = [
            self._normalize_strava_segment_data(athlete_id, day, item)
            for item in segment_data
        ]

        metrics = {
            "activity_count": len(activities),
            "activity_minutes": sum(int(item.moving_time_minutes or 0) for item in activities),
            "distance_meters": sum(float(item.distance_meters or 0.0) for item in activities),
            "segment_count": len(segments),
            "kom_count": sum(1 for item in segments if item.kom_flag),
        }

        return BiometricProviderSummary(
            athlete_id=athlete_id,
            provider="strava",
            day=day,
            sections={
                "activity_sync": activities,
                "segment_data": segments,
            },
            metrics=metrics,
            raw={
                "activity_sync": activity_sync,
                "segment_data": segment_data,
            },
        )

    def normalize_oura_payload(
        self,
        athlete_id: str,
        day: date,
        readiness: dict[str, Any] | None,
        hrv: dict[str, Any] | None,
        sleep_quality: dict[str, Any] | None,
    ) -> BiometricProviderSummary:
        """Normalize Oura readiness, HRV, and sleep quality payloads."""

        readiness_summary = self._normalize_oura_readiness(athlete_id, day, readiness)
        hrv_summary = self._normalize_oura_hrv(athlete_id, day, hrv)
        sleep_summary = self._normalize_oura_sleep_quality(athlete_id, day, sleep_quality)

        metrics = {
            "readiness_score": readiness_summary.readiness_score if readiness_summary else None,
            "hrv_ms": hrv_summary.hrv_ms if hrv_summary else None,
            "sleep_score": sleep_summary.sleep_score if sleep_summary else None,
            "sleep_duration_minutes": (
                sleep_summary.sleep_duration_minutes if sleep_summary else None
            ),
            "resting_hr_bpm": sleep_summary.resting_hr_bpm if sleep_summary else None,
        }

        return BiometricProviderSummary(
            athlete_id=athlete_id,
            provider="oura",
            day=day,
            sections={
                "readiness": readiness_summary,
                "hrv": hrv_summary,
                "sleep_quality": sleep_summary,
            },
            metrics=metrics,
            raw={
                "readiness": readiness or {},
                "hrv": hrv or {},
                "sleep_quality": sleep_quality or {},
            },
        )

    async def push_update_to_memory_states(
        self,
        state: InternalBiometricState,
    ) -> dict[str, Any]:
        """Upsert the normalized state into Supabase memory_states."""

        return await self._upsert_row("memory_states", state.to_memory_state_row())

    async def sync_daily_biometrics(
        self,
        context: AthleteAuthContext,
        day: date,
    ) -> InternalBiometricState:
        """End-to-end flow for one athlete/day."""

        auth = await self.authenticate_athlete(context)

        if context.provider == "garmin":
            workout_summaries = await self.fetch_garmin_workout_summaries(
                context.athlete_id,
                day,
                auth,
            )
            primary_biometrics = await self.fetch_garmin_primary_biometrics(
                context.athlete_id,
                day,
                auth,
            )
            summary = self.normalize_garmin_payload(
                athlete_id=context.athlete_id,
                day=day,
                workout_summaries=workout_summaries,
                primary_biometrics=primary_biometrics,
            )
        elif context.provider == "strava":
            activity_sync = await self.fetch_strava_activity_sync(
                context.athlete_id,
                day,
                auth,
            )
            segment_data = await self.fetch_strava_segment_data(
                context.athlete_id,
                day,
                auth,
            )
            summary = self.normalize_strava_payload(
                athlete_id=context.athlete_id,
                day=day,
                activity_sync=activity_sync,
                segment_data=segment_data,
            )
        else:
            readiness = await self.fetch_oura_readiness(
                context.athlete_id,
                day,
                auth,
            )
            hrv = await self.fetch_oura_hrv(
                context.athlete_id,
                day,
                auth,
            )
            sleep_quality = await self.fetch_oura_sleep_quality(
                context.athlete_id,
                day,
                auth,
            )
            summary = self.normalize_oura_payload(
                athlete_id=context.athlete_id,
                day=day,
                readiness=readiness,
                hrv=hrv,
                sleep_quality=sleep_quality,
            )

        state = summary.to_internal_state()
        await self.push_update_to_memory_states(state)
        return state

    async def sync_many_days(
        self,
        context: AthleteAuthContext,
        days: list[date],
    ) -> list[InternalBiometricState]:
        """Convenience helper for backfills and rolling sync jobs."""

        results: list[InternalBiometricState] = []
        for day in days:
            results.append(await self.sync_daily_biometrics(context, day))
        return results

    async def _upsert_row(self, table_name: str, row: dict[str, Any]) -> dict[str, Any]:
        if self.supabase_client is None:
            raise RuntimeError("Supabase client is not configured")

        table = self.supabase_client.table(table_name)
        if inspect.isawaitable(table):
            table = await table

        result = table.upsert(row)  # type: ignore[attr-defined]
        if inspect.isawaitable(result):
            result = await result
        return result

    def _normalize_garmin_workout_summary(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any],
    ) -> NormalizedGarminWorkoutSummary:
        return NormalizedGarminWorkoutSummary(
            athlete_id=athlete_id,
            provider="garmin",
            day=day,
            workout_id=summary.get("workout_id"),
            activity_type=summary.get("activity_type"),
            started_at=summary.get("started_at"),
            ended_at=summary.get("ended_at"),
            duration_minutes=summary.get("duration_minutes"),
            distance_meters=summary.get("distance_meters"),
            calories_burned=summary.get("calories_burned"),
            avg_hr_bpm=summary.get("avg_hr_bpm"),
            total_ascent_meters=summary.get("total_ascent_meters"),
            training_effect=summary.get("training_effect"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_garmin_primary_biometrics(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any] | None,
    ) -> NormalizedGarminPrimaryBiometrics | None:
        if not summary:
            return None

        return NormalizedGarminPrimaryBiometrics(
            athlete_id=athlete_id,
            provider="garmin",
            day=day,
            resting_hr_bpm=summary.get("resting_hr_bpm"),
            hrv_ms=summary.get("hrv_ms"),
            stress_score=summary.get("stress_score"),
            body_battery=summary.get("body_battery"),
            training_readiness=summary.get("training_readiness"),
            sleep_score=summary.get("sleep_score"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_strava_activity_sync(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any],
    ) -> NormalizedStravaActivitySync:
        return NormalizedStravaActivitySync(
            athlete_id=athlete_id,
            provider="strava",
            day=day,
            activity_id=summary.get("activity_id"),
            activity_type=summary.get("activity_type"),
            name=summary.get("name"),
            started_at=summary.get("started_at"),
            moving_time_minutes=summary.get("moving_time_minutes"),
            elapsed_time_minutes=summary.get("elapsed_time_minutes"),
            distance_meters=summary.get("distance_meters"),
            total_elevation_gain_meters=summary.get("total_elevation_gain_meters"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_strava_segment_data(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any],
    ) -> NormalizedStravaSegmentData:
        return NormalizedStravaSegmentData(
            athlete_id=athlete_id,
            provider="strava",
            day=day,
            segment_id=summary.get("segment_id"),
            activity_id=summary.get("activity_id"),
            segment_name=summary.get("segment_name"),
            elapsed_time_seconds=summary.get("elapsed_time_seconds"),
            moving_time_seconds=summary.get("moving_time_seconds"),
            effort_count=summary.get("effort_count"),
            kom_flag=summary.get("kom_flag"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_oura_readiness(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any] | None,
    ) -> NormalizedOuraReadiness | None:
        if not summary:
            return None

        return NormalizedOuraReadiness(
            athlete_id=athlete_id,
            provider="oura",
            day=day,
            readiness_score=summary.get("readiness_score"),
            temperature_deviation=summary.get("temperature_deviation"),
            recovery_index=summary.get("recovery_index"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_oura_hrv(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any] | None,
    ) -> NormalizedOuraHrv | None:
        if not summary:
            return None

        return NormalizedOuraHrv(
            athlete_id=athlete_id,
            provider="oura",
            day=day,
            hrv_ms=summary.get("hrv_ms"),
            hrv_sdnn_ms=summary.get("hrv_sdnn_ms"),
            hrv_sample_count=summary.get("hrv_sample_count"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_oura_sleep_quality(
        self,
        athlete_id: str,
        day: date,
        summary: dict[str, Any] | None,
    ) -> NormalizedOuraSleepQuality | None:
        if not summary:
            return None

        return NormalizedOuraSleepQuality(
            athlete_id=athlete_id,
            provider="oura",
            day=day,
            sleep_score=summary.get("sleep_score"),
            sleep_efficiency_percent=summary.get("sleep_efficiency_percent"),
            sleep_duration_minutes=summary.get("sleep_duration_minutes"),
            deep_sleep_minutes=summary.get("deep_sleep_minutes"),
            rem_sleep_minutes=summary.get("rem_sleep_minutes"),
            awake_minutes=summary.get("awake_minutes"),
            resting_hr_bpm=summary.get("resting_hr_bpm"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )


__all__ = [
    "AthleteAuthContext",
    "BiometricProviderSummary",
    "BiometricsProviderAdapter",
    "BiometricsService",
    "InternalBiometricState",
    "NormalizedGarminPrimaryBiometrics",
    "NormalizedGarminWorkoutSummary",
    "NormalizedOuraHrv",
    "NormalizedOuraReadiness",
    "NormalizedOuraSleepQuality",
    "NormalizedStravaActivitySync",
    "NormalizedStravaSegmentData",
    "ProviderAuthResult",
    "Provider",
]
