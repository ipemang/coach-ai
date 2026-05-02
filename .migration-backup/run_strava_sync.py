"""
COA-30: Railway Cron entrypoint for Strava daily activity sync.

Deploy this as a separate Railway service with:
  - Start Command: python run_strava_sync.py
  - Cron Schedule: 0 11 * * *   (runs at 11:00 UTC = 7am ET / 4am PT daily)

Required environment variables:
  SUPABASE_URL, SUPABASE_SERVICE_KEY, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
"""

import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services.strava_service import sync_all_athletes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(sync_all_athletes(dry_run=dry_run))
    print("Strava sync complete.")
