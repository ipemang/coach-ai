"""
COA-29: Railway Cron entrypoint for proactive athlete check-in scheduler.

Deploy as a Railway Cron Service:
  Start command: python run_checkin_scheduler.py
  Schedule: 0 13 * * *  (1pm UTC = 9am ET / 6am PT)

Required env vars:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
  WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID
"""

import asyncio
import logging
import os
import sys

# Allow running from repo root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def main(dry_run: bool = False) -> None:
    from supabase import create_client

    from app.core.config import get_settings
    from app.main import WhatsAppGraphClient
    from app.services.checkin_scheduler import CheckinScheduler, WhatsAppTaskAdapter

    settings = get_settings()
    supabase = create_client(settings.supabase_url, settings.supabase_service_role_key)

    whatsapp = WhatsAppGraphClient(
        access_token=settings.whatsapp_access_token,
        phone_number_id=settings.whatsapp_phone_number_id,
    )

    if dry_run:
        logger.info("[DRY RUN] Would send check-ins but skipping actual sends")

        class DryRunAdapter:
            async def enqueue(self, task_name: str, payload: dict) -> None:
                logger.info(
                    "[DRY RUN] Would send check-in to %s (%s)",
                    payload.get("display_name"),
                    payload.get("phone_number"),
                )

        adapter = DryRunAdapter()
    else:
        adapter = WhatsAppTaskAdapter(whatsapp_client=whatsapp, supabase_client=supabase)

    scheduler = CheckinScheduler(task_queue=adapter, supabase_client=supabase)
    result = await scheduler.run()
    logger.info(
        "Check-in scheduler run complete: scanned=%d due=%d reserved=%d skipped=%d",
        result.scanned, result.due, result.reserved, result.skipped,
    )


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    asyncio.run(main(dry_run=dry_run))
