"""
COA-30: Strava API v3 daily activity sync service.

Fetches the last 7 days of activities for every athlete with a strava_tokens row,
auto-refreshes tokens if needed, and writes results into athletes.current_state
under strava_* prefixed keys.

Usage:
    python -m backend.app.services.strava_service
    python -m backend.app.services.strava_service --dry-run
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone as tz

import httpx
from supabase import create_client, Client

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

STRAVA_BASE = "https://www.strava.com/api/v3"
STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token"


# ---------------------------------------------------------------------------
# Token refresh
# ---------------------------------------------------------------------------

async def _refresh_token_if_needed(
    client: httpx.AsyncClient,
    supabase: Client,
    athlete_id: str,
    token_row: dict,
) -> str:
    """Return a valid access token, refreshing via OAuth2 if within 300s of expiry."""
    expires_at = token_row["expires_at"]
    if time.time() < (expires_at - 300):
        return token_row["access_token"]

    logger.info("Refreshing Strava token for athlete %s (expired at %s)", athlete_id, expires_at)

    client_id = os.environ.get("STRAVA_CLIENT_ID", "")
    client_secret = os.environ.get("STRAVA_CLIENT_SECRET", "")

    resp = await client.post(
        STRAVA_TOKEN_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "grant_type": "refresh_token",
            "refresh_token": token_row["refresh_token"],
        },
        timeout=15,
    )
    if resp.status_code == 401:
        raise ValueError("Strava refresh token rejected (401) — coach must reconnect")
    resp.raise_for_status()

    data = resp.json()
    new_access = data["access_token"]
    new_refresh = data["refresh_token"]
    new_expires = data["expires_at"]

    supabase.table("strava_tokens").update({
        "access_token": new_access,
        "refresh_token": new_refresh,
        "expires_at": new_expires,
        "updated_at": datetime.now(tz.utc).isoformat(),
    }).eq("athlete_id", athlete_id).execute()

    logger.info("Strava token refreshed for athlete %s (new expiry %s)", athlete_id, new_expires)
    return new_access


# ---------------------------------------------------------------------------
# Strava API helpers
# ---------------------------------------------------------------------------

async def fetch_strava_weekly(access_token: str) -> dict:
    """
    Fetch the last 7 days of Strava activities and return a summary dict
    with strava_* prefixed keys for merging into current_state.
    """
    today = date.today()
    after = int((datetime.now(tz.utc) - timedelta(days=7)).timestamp())

    async with httpx.AsyncClient() as client:
        headers = {"Authorization": f"Bearer {access_token}"}

        # 1. List recent activities
        resp = await client.get(
            f"{STRAVA_BASE}/athlete/activities",
            headers=headers,
            params={"after": after, "per_page": 10},
            timeout=15,
        )
        if resp.status_code == 401:
            raise ValueError("Strava access token rejected (401)")
        resp.raise_for_status()

        activities = resp.json()
        if not isinstance(activities, list):
            activities = []

        # Filter to last 7 days and sort descending by start_date
        cutoff = (datetime.now(tz.utc) - timedelta(days=7)).isoformat()
        activities = [
            a for a in activities
            if a.get("start_date", "") >= cutoff
        ]
        activities.sort(key=lambda a: a.get("start_date", ""), reverse=True)

        if not activities:
            return {
                "strava_sync_date": today.isoformat(),
                "strava_weekly_activities": 0,
                "strava_weekly_distance_km": 0.0,
            }

        # 2. Get detail for most recent activity (includes average_heartrate)
        latest = activities[0]
        detail: dict = {}
        try:
            detail_resp = await client.get(
                f"{STRAVA_BASE}/activities/{latest['id']}",
                headers=headers,
                timeout=15,
            )
            detail_resp.raise_for_status()
            detail = detail_resp.json()
        except Exception as exc:
            logger.warning("Could not fetch Strava activity detail for id=%s: %s", latest.get("id"), exc)

        result = {
            "strava_last_activity_type": latest.get("sport_type"),
            "strava_last_activity_date": latest.get("start_date", "")[:10],
            "strava_last_distance_km": round(latest.get("distance", 0) / 1000, 2),
            "strava_last_duration_min": round(latest.get("moving_time", 0) / 60),
            "strava_last_avg_hr": detail.get("average_heartrate"),
            "strava_weekly_activities": len(activities),
            "strava_weekly_distance_km": round(
                sum(a.get("distance", 0) for a in activities) / 1000, 2
            ),
            "strava_sync_date": today.isoformat(),
        }
        return result


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

def _get_supabase() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    return create_client(url, key)


def _get_athletes_with_tokens(supabase: Client) -> list[dict]:
    """
    Return all athletes that have an entry in strava_tokens.
    Each dict has: athlete_id, full_name, current_state, plus token fields.
    """
    resp = (
        supabase.table("strava_tokens")
        .select("athlete_id, access_token, refresh_token, expires_at, athletes(id, full_name, current_state)")
        .execute()
    )
    rows = resp.data or []
    result = []
    for row in rows:
        athlete = row.get("athletes") or {}
        result.append({
            "athlete_id": row["athlete_id"],
            "full_name": athlete.get("full_name", "Unknown"),
            "current_state": athlete.get("current_state") or {},
            "access_token": row["access_token"],
            "refresh_token": row["refresh_token"],
            "expires_at": row["expires_at"],
        })
    return result


def _merge_current_state(existing: dict, strava_data: dict) -> dict:
    """
    Merge Strava data into the athlete's existing current_state.
    Strava keys are always prefixed with 'strava_' so they never clobber
    coach-entered fields.
    """
    merged = dict(existing)
    merged.update(strava_data)
    return merged


def _update_athlete_current_state(supabase: Client, athlete_id: str, new_state: dict) -> None:
    supabase.table("athletes").update({"current_state": new_state}).eq("id", athlete_id).execute()


def _update_last_synced(supabase: Client, athlete_id: str) -> None:
    now = datetime.now(tz.utc).isoformat()
    supabase.table("strava_tokens").update({"last_synced_at": now}).eq("athlete_id", athlete_id).execute()


# ---------------------------------------------------------------------------
# Main sync logic
# ---------------------------------------------------------------------------

async def sync_all_athletes(dry_run: bool = False) -> None:
    """
    Fetch the last 7 days of Strava activity data for every athlete that has
    a stored token and write the result into athletes.current_state.
    """
    logger.info("Starting Strava sync (dry_run=%s)", dry_run)

    supabase = _get_supabase()
    athletes = _get_athletes_with_tokens(supabase)

    if not athletes:
        logger.info("No athletes with Strava tokens found — nothing to sync.")
        return

    logger.info("Found %d athlete(s) with Strava tokens.", len(athletes))

    async with httpx.AsyncClient() as client:
        for athlete in athletes:
            athlete_id = athlete["athlete_id"]
            name = athlete["full_name"]

            logger.info("Syncing Strava data for athlete: %s (%s)", name, athlete_id)

            try:
                access_token = await _refresh_token_if_needed(
                    client, supabase, athlete_id, athlete
                )
            except ValueError as exc:
                logger.error(
                    "Strava token INVALID for athlete %s (%s): %s. "
                    "Coach must reconnect Strava in the dashboard.",
                    name, athlete_id, exc,
                )
                continue
            except Exception as exc:
                logger.error("Unexpected error refreshing Strava token for %s: %s", name, exc)
                continue

            try:
                strava_data = await fetch_strava_weekly(access_token)
            except ValueError as exc:
                logger.error(
                    "Strava API rejected token for athlete %s (%s): %s. "
                    "Coach must reconnect Strava.",
                    name, athlete_id, exc,
                )
                continue
            except Exception as exc:
                logger.error("Unexpected error fetching Strava data for %s: %s", name, exc)
                continue

            merged = _merge_current_state(athlete["current_state"], strava_data)

            logger.info(
                "Strava data for %s: type=%s, distance=%skm, weekly=%d activities",
                name,
                strava_data.get("strava_last_activity_type"),
                strava_data.get("strava_last_distance_km"),
                strava_data.get("strava_weekly_activities", 0),
            )

            if dry_run:
                logger.info("[DRY RUN] Would write current_state: %s", merged)
            else:
                _update_athlete_current_state(supabase, athlete_id, merged)
                _update_last_synced(supabase, athlete_id)
                logger.info("Successfully updated current_state for %s.", name)

    logger.info("Strava sync complete.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(sync_all_athletes(dry_run=dry_run))
