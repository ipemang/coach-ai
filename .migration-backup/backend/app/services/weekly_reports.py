"""COA-118: Weekly report auto-generation cron.

Run every Monday at 7am UTC via railway.json cron:
  cd /app/backend && python -m app.services.weekly_reports

For each athlete whose coach has report_cadence='weekly':
  - Generates a draft report for the previous week
  - Sends the coach a WhatsApp notification
"""
from __future__ import annotations

import logging
import sys
from datetime import date, timedelta

logger = logging.getLogger(__name__)


def run_weekly_reports() -> None:
    """Entry point for the weekly report cron job."""
    import asyncio
    from app.core.supabase import get_supabase_client
    from app.api.v1.training_reports import _generate_report_sync, _last_week_bounds

    supabase = get_supabase_client()
    period_start, period_end = _last_week_bounds()

    logger.info(
        "[weekly_reports] Starting for week %s – %s",
        period_start.isoformat(), period_end.isoformat(),
    )

    # Get all active athletes whose coach has weekly reporting enabled
    # coach.stable_preferences JSONB field holds report_cadence if set
    athletes_res = supabase.table("athletes").select(
        "id, full_name, coach_id, coaches(id, full_name, whatsapp_number, stable_preferences)"
    ).is_("archived_at", "null").execute()

    athletes = athletes_res.data or []
    generated = 0
    errors = 0

    for athlete in athletes:
        coach_data = athlete.get("coaches") or {}
        if isinstance(coach_data, list):
            coach_data = coach_data[0] if coach_data else {}

        # Check cadence setting from coach preferences
        prefs = coach_data.get("stable_preferences") or {}
        cadence = prefs.get("report_cadence", "weekly")
        if cadence != "weekly":
            continue

        athlete_id = str(athlete["id"])
        coach_id = str(coach_data.get("id") or athlete["coach_id"])

        # Skip if a report for this period already exists
        existing = supabase.table("training_reports").select("id").eq(
            "athlete_id", athlete_id
        ).eq("period_start", period_start.isoformat()).execute()
        if existing.data:
            logger.info("[weekly_reports] Report already exists for athlete=%s — skipping", athlete_id[:8])
            continue

        try:
            report = _generate_report_sync(
                supabase=supabase,
                athlete_id=athlete_id,
                coach_id=coach_id,
                period_type="weekly",
                period_start=period_start,
                period_end=period_end,
            )
            generated += 1

            # Notify coach via WhatsApp
            coach_wa = coach_data.get("whatsapp_number")
            if coach_wa:
                try:
                    import asyncio
                    from app.core.config import get_settings
                    from app.main import WhatsAppGraphClient
                    from app.services.whatsapp_service import WhatsAppRecipient, WhatsAppService

                    _settings = get_settings()
                    _wa_client = WhatsAppGraphClient(
                        access_token=_settings.whatsapp_access_token,
                        phone_number_id=_settings.whatsapp_phone_number_id,
                    )
                    wa = WhatsAppService(whatsapp_client=_wa_client)
                    recipient = WhatsAppRecipient(
                        athlete_id=coach_id,
                        phone_number=coach_wa,
                        timezone_name="UTC",
                        display_name=coach_data.get("full_name", "Coach"),
                    )
                    athlete_name = athlete.get("full_name", "your athlete")
                    asyncio.get_event_loop().run_until_complete(wa.send_text_message(
                        recipient=recipient,
                        body=(
                            f"📊 Weekly report draft ready for {athlete_name}.\n\n"
                            f"*{report.get('title', 'Training Report')}*\n\n"
                            "Review and publish from your dashboard."
                        ),
                    ))
                except Exception as wa_exc:
                    logger.warning(
                        "[weekly_reports] WhatsApp notify failed for coach=%s: %s",
                        coach_id[:8], wa_exc,
                    )

        except Exception as exc:
            errors += 1
            logger.error(
                "[weekly_reports] Failed for athlete=%s: %s", athlete_id[:8], exc
            )

    logger.info(
        "[weekly_reports] Done — %d generated, %d errors (out of %d athletes checked)",
        generated, errors, len(athletes),
    )


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
        stream=sys.stdout,
    )
    run_weekly_reports()
