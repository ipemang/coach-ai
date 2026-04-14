"""
COA-26: Oura Ring daily sync service.

Fetches yesterday's readiness score, sleep score, and HRV from the Oura API v2
for every athlete that has a token stored in the oura_tokens table, then
writes the results into athletes.current_state (merges, does not overwrite).

Endpoints used:
  GET https://api.ouraring.com/v2/usercollection/daily_readiness?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  GET https://api.ouraring.com/v2/usercollection/daily_sleep?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
  GET https://api.ouraring.com/v2/usercollection/sleep?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    (used for average_hrv — daily_readiness only returns hrv_balance contributor, not raw HRV)

Run as a standalone script (Railway Cron Service) or imported and called from FastAPI.

Usage:
    python -m backend.app.services.oura_service          # run sync for all athletes
    python -m backend.app.services.oura_service --dry-run  # print what would be written, no DB writes
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from datetime import date, timedelta
from typing import Optional

import httpx
from supabase import create_client, Client

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

OURA_BASE = "https://api.ouraring.com/v2/usercollection"


# ---------------------------------------------------------------------------
# Oura API helpers
# ---------------------------------------------------------------------------

async def _oura_get(client: httpx.AsyncClient, path: str, token: str, params: dict) -> dict:
    """Make a single authenticated GET request to the Oura API v2."""
    url = f"{OURA_BASE}/{path}"
    headers = {"Authorization": f"Bearer {token}"}
    resp = await client.get(url, headers=headers, params=params, timeout=15)
    if resp.status_code == 401:
        raise ValueError(f"Oura token rejected (401) for path={path}")
    resp.raise_for_status()
    return resp.json()


async def fetch_oura_daily(token: str, target_date: date) -> dict:
    """
    Fetch readiness score, sleep score, and average HRV for a single date.

    Returns a dict like:
        {
            "oura_readiness_score": 82,
            "oura_sleep_score": 74,
            "oura_avg_hrv": 55,
            "oura_sync_date": "2026-04-13",
        }
    Any field that cannot be fetched will be None.
    """
    date_str = target_date.isoformat()
    params = {"start_date": date_str, "end_date": date_str}

    result: dict = {
        "oura_readiness_score": None,
        "oura_sleep_score": None,
        "oura_avg_hrv": None,
        "oura_sync_date": date_str,
    }

    async with httpx.AsyncClient() as client:
        # 1. Daily readiness score
        try:
            data = await _oura_get(client, "daily_readiness", token, params)
            items = data.get("data", [])
            if items:
                result["oura_readiness_score"] = items[0].get("score")
        except Exception as exc:
            logger.warning("Could not fetch daily_readiness for %s: %s", date_str, exc)

        # 2. Daily sleep score
        try:
            data = await _oura_get(client, "daily_sleep", token, params)
            items = data.get("data", [])
            if items:
                result["oura_sleep_score"] = items[0].get("score")
        except Exception as exc:
            logger.warning("Could not fetch daily_sleep for %s: %s", date_str, exc)

        # 3. Average HRV — comes from the detailed sleep endpoint
        #    /usercollection/sleep returns per-session average_hrv; we take the
        #    highest (longest sleep) session's value.
        try:
            data = await _oura_get(client, "sleep", token, params)
            items = data.get("data", [])
            hrv_values = [
                item["average_hrv"]
                for item in items
                if item.get("average_hrv") is not None
                and item.get("type") == "long_sleep"
            ]
            if not hrv_values:
                # fall back to any sleep type
                hrv_values = [
                    item["average_hrv"]
                    for item in items
                    if item.get("average_hrv") is not None
                ]
            if hrv_values:
                result["oura_avg_hrv"] = round(sum(hrv_values) / len(hrv_values), 1)
        except Exception as exc:
            logger.warning("Could not fetch sleep/HRV for %s: %s", date_str, exc)

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
    Return all athletes that have an entry in oura_tokens.
    Each dict has: athlete_id, full_name, current_state (dict), access_token.
    """
    # JOIN athletes + oura_tokens
    resp = (
        supabase.table("oura_tokens")
        .select("athlete_id, access_token, athletes(id, full_name, current_state)")
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
        })
    return result


def _merge_current_state(existing: dict, oura_data: dict) -> dict:
    """
    Merge Oura data into the athlete's existing current_state.
    Oura keys are always prefixed with 'oura_' so they never clobber
    coach-entered fields like training_phase, soreness_notes, etc.
    """
    merged = dict(existing)
    merged.update(oura_data)
    return merged


def _update_athlete_current_state(supabase: Client, athlete_id: str, new_state: dict) -> None:
    supabase.table("athletes").update({"current_state": new_state}).eq("id", athlete_id).execute()


def _update_last_synced(supabase: Client, athlete_id: str) -> None:
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("oura_tokens").update({"last_synced_at": now}).eq("athlete_id", athlete_id).execute()


# ---------------------------------------------------------------------------
# Main sync logic
# ---------------------------------------------------------------------------

async def sync_all_athletes(dry_run: bool = False) -> None:
    """
    Pull yesterday's Oura data for every athlete that has a stored token and
    write the result into athletes.current_state.
    """
    yesterday = date.today() - timedelta(days=1)
    logger.info("Starting Oura sync for %s (dry_run=%s)", yesterday.isoformat(), dry_run)

    supabase = _get_supabase()
    athletes = _get_athletes_with_tokens(supabase)

    if not athletes:
        logger.info("No athletes with Oura tokens found — nothing to sync.")
        return

    logger.info("Found %d athlete(s) with Oura tokens.", len(athletes))

    for athlete in athletes:
        athlete_id = athlete["athlete_id"]
        name = athlete["full_name"]
        token = athlete["access_token"]

        logger.info("Syncing Oura data for athlete: %s (%s)", name, athlete_id)

        try:
            oura_data = await fetch_oura_daily(token, yesterday)
        except ValueError as exc:
            # Token rejected — log clearly so the coach knows to re-enter it
            logger.error(
                "Oura token INVALID for athlete %s (%s): %s. "
                "Coach must re-enter the PAT in the dashboard.",
                name, athlete_id, exc
            )
            continue
        except Exception as exc:
            logger.error("Unexpected error fetching Oura data for %s: %s", name, exc)
            continue

        merged = _merge_current_state(athlete["current_state"], oura_data)

        logger.info(
            "Oura data for %s: readiness=%s, sleep=%s, hrv=%s",
            name,
            oura_data.get("oura_readiness_score"),
            oura_data.get("oura_sleep_score"),
            oura_data.get("oura_avg_hrv"),
        )

        if dry_run:
            logger.info("[DRY RUN] Would write current_state: %s", merged)
        else:
            _update_athlete_current_state(supabase, athlete_id, merged)
            _update_last_synced(supabase, athlete_id)
            logger.info("Successfully updated current_state for %s.", name)

            # COA-38: Run predictive analysis after Oura sync
            try:
                from app.services.predictive_analysis import PredictiveAnalysisService

                memory_rows = (
                    supabase.table("memory_states")
                    .select("*")
                    .eq("athlete_id", athlete_id)
                    .order("created_at", desc=True)
                    .limit(20)
                    .execute()
                ).data or []

                if memory_rows:
                    service = PredictiveAnalysisService(supabase)
                    analysis = await service.analyze_athlete(athlete_id, memory_rows)
                    if analysis and analysis.flags:
                        flags_data = [
                            {
                                "code": f.code,
                                "label": f.label,
                                "priority": f.priority,
                                "reason": f.reason,
                            }
                            for f in analysis.flags
                        ]
                        merged_with_flags = {**merged, "predictive_flags": flags_data}
                        _update_athlete_current_state(supabase, athlete_id, merged_with_flags)
                        logger.info(
                            "[COA-38] Stored %d predictive flags for %s",
                            len(flags_data), name,
                        )
                    else:
                        logger.info("[COA-38] No predictive flags for %s", name)
                else:
                    logger.info("[COA-38] No memory_states rows for %s — skipping analysis", name)
            except Exception as exc:
                logger.warning("[COA-38] Predictive analysis failed for %s: %s", name, exc)

    logger.info("Oura sync complete.")


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(sync_all_athletes(dry_run=dry_run))
