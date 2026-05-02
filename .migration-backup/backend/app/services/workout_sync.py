"""COA-84: Pull-on-demand Strava activity sync.

Fetches the most recent Strava activity for a single athlete immediately
before the AI pipeline runs so the ReasoningAgent has workout context
for the current conversation.

Different from strava_service.py (batch daily sync across all athletes).
This module is called per-athlete, per-message, with strict latency guards:
  - Skip if most recent DB workout was upserted < 15 min ago (already fresh)
  - Skip if Strava call exceeds 5s timeout
  - Always degrade gracefully — never block the webhook response
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

logger = logging.getLogger(__name__)

STRAVA_BASE = "https://www.strava.com/api/v3"
STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"

_CACHE_TTL_SECONDS = 900   # 15 min — skip sync if DB workout this fresh
_ACTIVITY_MAX_AGE_H = 24   # only inject activity if < 24h old
_HTTP_TIMEOUT = 5.0        # hard cap to protect webhook latency


class WorkoutSyncService:
    def __init__(self, supabase: Any) -> None:
        self._db = supabase

    async def fetch_latest(self, athlete_id: str) -> dict | None:
        """Pull the most recent Strava activity and merge into current_state.

        Returns a strava_data dict (same keys as strava_service.py) on success,
        or None if the athlete has no tokens, no recent activity, or any error.

        Side-effects:
          - Updates strava_tokens row with refreshed access token if needed
          - Upserts a row into workouts table for the pulled activity
          - Updates athletes.current_state with strava_* keys
        """
        # 1. Look up Strava tokens
        token_row = self._get_token_row(athlete_id)
        if not token_row:
            logger.debug("[workout_sync] No Strava tokens for athlete=%s — skipping", athlete_id[:8])
            return None

        # 2. Skip if we synced very recently (cache hit)
        if self._is_cache_fresh(token_row):
            logger.debug("[workout_sync] Cache fresh for athlete=%s — skipping pull", athlete_id[:8])
            return None

        # 3. Ensure token is valid
        try:
            access_token = await self._ensure_token(token_row, athlete_id)
        except Exception as exc:
            logger.warning("[workout_sync] Token refresh failed for athlete=%s: %s", athlete_id[:8], exc)
            return None

        # 4. Pull latest activity from Strava
        try:
            activity = await self._fetch_latest_activity(access_token)
        except Exception as exc:
            logger.warning("[workout_sync] Strava fetch failed for athlete=%s: %s", athlete_id[:8], exc)
            return None

        if not activity:
            return None

        # 5. Only use if activity happened within the last 24h
        start_date_str = activity.get("start_date") or ""
        if not self._is_recent(start_date_str):
            logger.debug(
                "[workout_sync] Latest activity (%s) > 24h old for athlete=%s — skipping",
                start_date_str[:10], athlete_id[:8],
            )
            return None

        # 6. Build strava_data summary
        strava_data = self._build_strava_data(activity)

        # 7. Upsert into workouts table + update current_state
        self._upsert_workout(athlete_id, activity, strava_data)
        self._update_current_state(athlete_id, strava_data)
        self._touch_last_synced(athlete_id)

        logger.info(
            "[workout_sync] Pulled %s activity for athlete=%s — %skm %.0fmin",
            strava_data.get("strava_last_activity_type", "?"),
            athlete_id[:8],
            strava_data.get("strava_last_distance_km", 0),
            strava_data.get("strava_last_duration_min", 0),
        )
        return strava_data

    # ── Private helpers ────────────────────────────────────────────────────────

    def _get_token_row(self, athlete_id: str) -> dict | None:
        try:
            result = self._db.table("strava_tokens").select(
                "access_token, refresh_token, expires_at, last_synced_at"
            ).eq("athlete_id", athlete_id).limit(1).execute()
            rows = result.data or []
            return rows[0] if rows else None
        except Exception as exc:
            logger.debug("[workout_sync] Token lookup failed: %s", exc)
            return None

    def _is_cache_fresh(self, token_row: dict) -> bool:
        last_synced = token_row.get("last_synced_at")
        if not last_synced:
            return False
        try:
            synced_dt = datetime.fromisoformat(last_synced.replace("Z", "+00:00"))
            age_s = (datetime.now(timezone.utc) - synced_dt).total_seconds()
            return age_s < _CACHE_TTL_SECONDS
        except Exception:
            return False

    async def _ensure_token(self, token_row: dict, athlete_id: str) -> str:
        expires_at = token_row.get("expires_at") or 0
        if time.time() < (float(expires_at) - 300):
            return str(token_row["access_token"])

        import os
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                STRAVA_TOKEN_URL,
                data={
                    "client_id": os.environ.get("STRAVA_CLIENT_ID", ""),
                    "client_secret": os.environ.get("STRAVA_CLIENT_SECRET", ""),
                    "grant_type": "refresh_token",
                    "refresh_token": token_row["refresh_token"],
                },
            )
            resp.raise_for_status()
            data = resp.json()

        self._db.table("strava_tokens").update({
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": data["expires_at"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("athlete_id", athlete_id).execute()

        return str(data["access_token"])

    async def _fetch_latest_activity(self, access_token: str) -> dict | None:
        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(
                f"{STRAVA_BASE}/athlete/activities",
                headers=headers,
                params={"per_page": 1},
            )
            if resp.status_code == 401:
                raise ValueError("Strava access token rejected (401)")
            resp.raise_for_status()
            activities = resp.json()
            return activities[0] if isinstance(activities, list) and activities else None

    def _is_recent(self, start_date_str: str) -> bool:
        if not start_date_str:
            return False
        try:
            dt = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
            return (datetime.now(timezone.utc) - dt) < timedelta(hours=_ACTIVITY_MAX_AGE_H)
        except Exception:
            return False

    def _build_strava_data(self, activity: dict) -> dict:
        return {
            "strava_last_activity_type": activity.get("sport_type") or activity.get("type"),
            "strava_last_activity_date": (activity.get("start_date") or "")[:10],
            "strava_last_distance_km": round((activity.get("distance") or 0) / 1000, 2),
            "strava_last_duration_min": round((activity.get("moving_time") or 0) / 60),
            "strava_last_avg_hr": activity.get("average_heartrate"),
            "strava_sync_date": datetime.now(timezone.utc).date().isoformat(),
        }

    def _upsert_workout(self, athlete_id: str, activity: dict, strava_data: dict) -> None:
        """Write the pulled activity into the workouts table for AI context.

        Checks for an existing strava_pull row on this date first to avoid duplicates.
        """
        try:
            activity_date = strava_data.get("strava_last_activity_date") or datetime.now(timezone.utc).date().isoformat()

            # Skip if a strava_pull row already exists for this athlete + date
            existing = self._db.table("workouts").select("id").eq(
                "athlete_id", athlete_id
            ).eq("scheduled_date", activity_date).eq("source", "strava_pull").limit(1).execute()
            if existing.data:
                return

            hr_note = f" — avg HR {strava_data['strava_last_avg_hr']}bpm" if strava_data.get("strava_last_avg_hr") else ""
            payload = {
                "athlete_id": athlete_id,
                "scheduled_date": activity_date,
                "session_type": strava_data.get("strava_last_activity_type") or "workout",
                "duration_min": strava_data.get("strava_last_duration_min"),
                "distance_km": strava_data.get("strava_last_distance_km"),
                "status": "completed",
                "source": "strava_pull",
                "coaching_notes": f"Auto-synced from Strava (pull-on-demand){hr_note}",
            }
            self._db.table("workouts").insert(payload).execute()
        except Exception as exc:
            logger.warning("[workout_sync] Failed to record workout for athlete=%s: %s", athlete_id[:8], exc)

    def _update_current_state(self, athlete_id: str, strava_data: dict) -> None:
        """Merge strava_* keys into athletes.current_state."""
        try:
            existing_res = self._db.table("athletes").select("current_state").eq("id", athlete_id).single().execute()
            current_state = (existing_res.data or {}).get("current_state") or {}
            merged = {**current_state, **strava_data}
            self._db.table("athletes").update({"current_state": merged}).eq("id", athlete_id).execute()
        except Exception as exc:
            logger.warning("[workout_sync] Failed to update current_state for athlete=%s: %s", athlete_id[:8], exc)

    def _touch_last_synced(self, athlete_id: str) -> None:
        try:
            self._db.table("strava_tokens").update({
                "last_synced_at": datetime.now(timezone.utc).isoformat(),
            }).eq("athlete_id", athlete_id).execute()
        except Exception as exc:
            logger.debug("[workout_sync] Failed to touch last_synced_at: %s", exc)


__all__ = ["WorkoutSyncService"]
