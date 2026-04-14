"""
COA-26: Railway Cron Service entrypoint for Oura Ring daily sync.

Deploy this as a separate Railway service with:
  - Start Command: python sync_oura.py
  - Cron Schedule: 0 10 * * *   (runs at 10:00 UTC = 6am ET / 3am PT daily)
    Athletes' rings sync overnight; by 10 UTC the data is reliably available.

Required environment variables (shared with main app):
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

No other dependencies needed — uses the same oura_service module.
"""

import asyncio
import logging
import sys
import os

# Allow running from repo root or from backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from app.services.oura_service import sync_all_athletes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(sync_all_athletes(dry_run=dry_run))
    print("Oura sync job finished.")
