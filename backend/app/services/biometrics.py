"""Biometric ingestion and synchronization service.

This module keeps the Coach.AI biometric layer modular so provider-specific
transport/auth logic can be swapped in later without changing the service
contract. The normalized dataclasses below give us a single shape for both
Rook and Garmin, while the service keeps the Supabase sync path isolated.
"""

from __future__ import annotations

import inspect
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import date, datetime, timezone
from typing import Any, Literal, Protocol

Provider = Literal["rook", "garmin"]


class SupabaseClientProtocol(Protocol):
    """Minimal protocol for the Supabase client used by this service."""

    def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


class BiometricsProviderAdapter(Protocol):
    """Provider adapter contract for Rook/Garmin integrations.

    Real adapters can live behind this interface and use OAuth tokens,
    service credentials, webhooks, or any future auth flow without requiring
    changes to the orchestration layer.
    """

    provider: Provider

    async def authenticate(self, context: AthleteAuthContext) -> ProviderAuthResult:
        ...

    async def fetch_sleep_summary(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any]:
        ...

    async def fetch_hrv_summary(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any]:
        ...

    async def fetch_workout_summaries(
        self,
        athlete_id: str,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
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
class NormalizedSleepSummary:
    """Provider-normalized sleep data for a single day."""

    athlete_id: str
    provider: Provider
    day: date
    sleep_start_at: datetime | None = None
    sleep_end_at: datetime | None = None
    sleep_duration_minutes: int | None = None
    sleep_score: float | None = None
    sleep_efficiency_percent: float | None = None
    deep_sleep_minutes: int | None = None
    rem_sleep_minutes: int | None = None
    light_sleep_minutes: int | None = None
    awake_minutes: int | None = None
    resting_hr_bpm: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedHrvSummary:
    """Provider-normalized HRV snapshot for a single day."""

    athlete_id: str
    provider: Provider
    day: date
    hrv_ms: float | None = None
    hrv_sdnn_ms: float | None = None
    hrv_sample_count: int | None = None
    resting_hr_bpm: float | None = None
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class NormalizedWorkoutSummary:
    """Provider-normalized workout summary for a single session."""

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
    source_record_ids: list[str] = field(default_factory=list)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class DailyBiometricSummary:
    """Normalized daily biometric bundle shared by Rook and Garmin."""

    athlete_id: str
    provider: Provider
    day: date
    sleep: NormalizedSleepSummary | None = None
    hrv: NormalizedHrvSummary | None = None
    workouts: list[NormalizedWorkoutSummary] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def source_record_ids(self) -> list[str]:
        """Collect source record ids across all normalized provider payloads."""

        source_ids: list[str] = []
        if self.sleep:
            source_ids.extend(self.sleep.source_record_ids)
        if self.hrv:
            source_ids.extend(self.hrv.source_record_ids)
        for workout in self.workouts:
            source_ids.extend(workout.source_record_ids)
        return source_ids

    def to_payload(self) -> dict[str, Any]:
        """Convert the summary into a serializable Supabase payload."""

        return {
            "athlete_id": self.athlete_id,
            "provider": self.provider,
            "source_day": self.day.isoformat(),
            "sleep": _json_safe(self.sleep),
            "hrv": _json_safe(self.hrv),
            "workouts": _json_safe(self.workouts),
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


class BiometricsService:
    """Orchestrates provider auth, fetch, normalization, and persistence."""

    def __init__(
        self,
        supabase_client: SupabaseClientProtocol | None = None,
        provider_adapters: dict[Provider, BiometricsProviderAdapter] | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.provider_adapters = provider_adapters or {}

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
        """Authenticate a specific athlete against Rook or Garmin."""

        adapter = self._get_provider_adapter(context.provider)
        return await adapter.authenticate(context)

    async def fetch_daily_sleep_summary(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any]:
        """Fetch daily sleep data from the specified provider."""

        adapter = self._get_provider_adapter(provider)
        return await adapter.fetch_sleep_summary(athlete_id, day, auth)

    async def fetch_daily_hrv_summary(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        auth: ProviderAuthResult,
    ) -> dict[str, Any]:
        """Fetch daily HRV data from the specified provider."""

        adapter = self._get_provider_adapter(provider)
        return await adapter.fetch_hrv_summary(athlete_id, day, auth)

    async def fetch_daily_workout_summaries(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        auth: ProviderAuthResult,
    ) -> list[dict[str, Any]]:
        """Fetch daily workout summaries from the specified provider."""

        adapter = self._get_provider_adapter(provider)
        return await adapter.fetch_workout_summaries(athlete_id, day, auth)

    def normalize_daily_biometrics(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        sleep_summary: dict[str, Any] | None,
        hrv_summary: dict[str, Any] | None,
        workout_summaries: list[dict[str, Any]] | None,
    ) -> DailyBiometricSummary:
        """Normalize provider data into a shared daily biometric bundle."""

        workout_summaries = workout_summaries or []

        sleep = self._normalize_sleep_summary(athlete_id, provider, day, sleep_summary)
        hrv = self._normalize_hrv_summary(athlete_id, provider, day, hrv_summary)
        workouts = [
            self._normalize_workout_summary(athlete_id, provider, day, item)
            for item in workout_summaries
        ]

        metrics = {
            "sleep_duration_minutes": sleep.sleep_duration_minutes if sleep else None,
            "sleep_score": sleep.sleep_score if sleep else None,
            "hrv_ms": hrv.hrv_ms if hrv else None,
            "workout_count": len(workouts),
            "workout_minutes": sum(int(item.duration_minutes or 0) for item in workouts),
            "resting_hr_bpm": (
                (sleep.resting_hr_bpm if sleep else None)
                or (hrv.resting_hr_bpm if hrv else None)
            ),
        }

        return DailyBiometricSummary(
            athlete_id=athlete_id,
            provider=provider,
            day=day,
            sleep=sleep,
            hrv=hrv,
            workouts=workouts,
            metrics=metrics,
            raw={
                "sleep": sleep_summary or {},
                "hrv": hrv_summary or {},
                "workouts": workout_summaries,
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
        sleep_summary = await self.fetch_daily_sleep_summary(
            context.athlete_id,
            context.provider,
            day,
            auth,
        )
        hrv_summary = await self.fetch_daily_hrv_summary(
            context.athlete_id,
            context.provider,
            day,
            auth,
        )
        workout_summaries = await self.fetch_daily_workout_summaries(
            context.athlete_id,
            context.provider,
            day,
            auth,
        )

        summary = self.normalize_daily_biometrics(
            athlete_id=context.athlete_id,
            provider=context.provider,
            day=day,
            sleep_summary=sleep_summary,
            hrv_summary=hrv_summary,
            workout_summaries=workout_summaries,
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

    def _normalize_sleep_summary(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        summary: dict[str, Any] | None,
    ) -> NormalizedSleepSummary | None:
        if not summary:
            return None

        return NormalizedSleepSummary(
            athlete_id=athlete_id,
            provider=provider,
            day=day,
            sleep_start_at=summary.get("sleep_start_at"),
            sleep_end_at=summary.get("sleep_end_at"),
            sleep_duration_minutes=summary.get("sleep_duration_minutes"),
            sleep_score=summary.get("sleep_score"),
            sleep_efficiency_percent=summary.get("sleep_efficiency_percent"),
            deep_sleep_minutes=summary.get("deep_sleep_minutes"),
            rem_sleep_minutes=summary.get("rem_sleep_minutes"),
            light_sleep_minutes=summary.get("light_sleep_minutes"),
            awake_minutes=summary.get("awake_minutes"),
            resting_hr_bpm=summary.get("resting_hr_bpm"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_hrv_summary(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        summary: dict[str, Any] | None,
    ) -> NormalizedHrvSummary | None:
        if not summary:
            return None

        return NormalizedHrvSummary(
            athlete_id=athlete_id,
            provider=provider,
            day=day,
            hrv_ms=summary.get("hrv_ms"),
            hrv_sdnn_ms=summary.get("hrv_sdnn_ms"),
            hrv_sample_count=summary.get("hrv_sample_count"),
            resting_hr_bpm=summary.get("resting_hr_bpm"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )

    def _normalize_workout_summary(
        self,
        athlete_id: str,
        provider: Provider,
        day: date,
        summary: dict[str, Any],
    ) -> NormalizedWorkoutSummary:
        return NormalizedWorkoutSummary(
            athlete_id=athlete_id,
            provider=provider,
            day=day,
            workout_id=summary.get("workout_id"),
            activity_type=summary.get("activity_type"),
            started_at=summary.get("started_at"),
            ended_at=summary.get("ended_at"),
            duration_minutes=summary.get("duration_minutes"),
            distance_meters=summary.get("distance_meters"),
            calories_burned=summary.get("calories_burned"),
            avg_hr_bpm=summary.get("avg_hr_bpm"),
            source_record_ids=list(summary.get("source_record_ids") or []),
            raw=dict(summary),
        )


__all__ = [
    "AthleteAuthContext",
    "BiometricsProviderAdapter",
    "BiometricsService",
    "DailyBiometricSummary",
    "InternalBiometricState",
    "NormalizedHrvSummary",
    "NormalizedSleepSummary",
    "NormalizedWorkoutSummary",
    "ProviderAuthResult",
    "Provider",
]
