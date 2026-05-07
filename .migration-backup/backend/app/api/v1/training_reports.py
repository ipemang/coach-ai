"""COA-118: Training report generation pipeline.

Endpoints (coach-facing):
  POST  /api/v1/coach/athletes/{athlete_id}/reports/generate  — AI drafts a report
  GET   /api/v1/coach/athletes/{athlete_id}/reports            — list all reports (draft + published)
  PATCH /api/v1/coach/reports/{report_id}                     — edit draft text / title
  POST  /api/v1/coach/reports/{report_id}/publish             — publish + WhatsApp notification to coach

Endpoints (athlete-facing):
  GET   /api/v1/athlete/reports                               — list published reports (newest first)
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from app.core.security import (
    AuthenticatedPrincipal,
    require_roles,
    resolve_athlete_scope,
    resolve_coach_scope,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["training-reports"])


# ── Models ────────────────────────────────────────────────────────────────────

class TrainingReportOut(BaseModel):
    id: str
    athlete_id: str
    coach_id: str
    period_type: str
    period_start: str
    period_end: str
    title: str
    summary_text: Optional[str]
    full_text: Optional[str]
    highlights: list[str]
    watchouts: list[str]
    status: str
    published_at: Optional[str]
    created_at: str


class GenerateReportRequest(BaseModel):
    period_type: str = "weekly"          # weekly | monthly | block
    period_start: Optional[str] = None   # YYYY-MM-DD; defaults to last Monday
    period_end: Optional[str] = None     # YYYY-MM-DD; defaults to last Sunday


class PatchReportRequest(BaseModel):
    title: Optional[str] = None
    summary_text: Optional[str] = None
    full_text: Optional[str] = None
    highlights: Optional[list[str]] = None
    watchouts: Optional[list[str]] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _row_to_out(r: dict) -> TrainingReportOut:
    return TrainingReportOut(
        id=str(r["id"]),
        athlete_id=str(r["athlete_id"]),
        coach_id=str(r["coach_id"]),
        period_type=r.get("period_type", "weekly"),
        period_start=str(r.get("period_start", "")),
        period_end=str(r.get("period_end", "")),
        title=r.get("title", ""),
        summary_text=r.get("summary_text"),
        full_text=r.get("full_text"),
        highlights=r.get("highlights") or [],
        watchouts=r.get("watchouts") or [],
        status=r.get("status", "draft"),
        published_at=str(r["published_at"]) if r.get("published_at") else None,
        created_at=str(r.get("created_at", "")),
    )


def _last_week_bounds() -> tuple[date, date]:
    """Returns (last Monday, last Sunday) as date objects."""
    today = date.today()
    days_since_monday = today.weekday()
    last_monday = today - timedelta(days=days_since_monday + 7)
    last_sunday = last_monday + timedelta(days=6)
    return last_monday, last_sunday


def _generate_report_sync(
    supabase,
    athlete_id: str,
    coach_id: str,
    period_type: str,
    period_start: date,
    period_end: date,
) -> dict[str, Any]:
    """Synchronous report generation — called via run_in_threadpool.

    Gathers context: workouts, memory events, suggestions.
    Calls LLMClient to draft the report JSON.
    Inserts to training_reports as status=draft.
    Returns the created row.
    """
    from app.services.llm_client import LLMClient, LLMClientError
    from app.services.usage_logger import UsageLogger, LLMResponse as UsageLLMResponse

    period_start_s = period_start.isoformat()
    period_end_s = period_end.isoformat()

    # ── 1. Gather context ──────────────────────────────────────────────────────

    # Athlete profile
    athlete_row = supabase.table("athletes").select(
        "full_name, primary_sport, target_event_name, target_event_date, "
        "memory_summary, stable_profile, current_state"
    ).eq("id", athlete_id).single().execute()
    athlete = athlete_row.data or {}
    athlete_name = athlete.get("full_name", "Athlete")

    # Workouts for the period
    workouts_res = supabase.table("workouts").select(
        "session_type, title, scheduled_date, status, duration_min, distance_km, "
        "compliance_pct, coaching_notes"
    ).eq("athlete_id", athlete_id).gte(
        "scheduled_date", period_start_s
    ).lte("scheduled_date", period_end_s).order("scheduled_date").execute()
    workouts = workouts_res.data or []

    total_planned = len(workouts)
    completed = sum(1 for w in workouts if w.get("status") == "completed")
    compliance_pct = round(completed / total_planned * 100) if total_planned else 0

    # Compliance by sport
    sport_totals: dict[str, dict] = {}
    for w in workouts:
        sport = w.get("session_type", "other")
        if sport not in sport_totals:
            sport_totals[sport] = {"planned": 0, "completed": 0}
        sport_totals[sport]["planned"] += 1
        if w.get("status") == "completed":
            sport_totals[sport]["completed"] += 1

    sport_summary = "; ".join(
        f"{s}: {v['completed']}/{v['planned']} sessions"
        for s, v in sport_totals.items()
    ) or "no workouts recorded"

    workout_details = "\n".join(
        f"- {w.get('scheduled_date')} {w.get('session_type','?')}: "
        f"{w.get('title') or '(untitled)'} — {w.get('status','?')}"
        f"{', notes: ' + w['coaching_notes'][:80] if w.get('coaching_notes') else ''}"
        for w in workouts[:20]
    ) or "No workouts in this period."

    # Memory events for the period
    mem_res = supabase.table("athlete_memory_events").select(
        "event_type, content, created_at"
    ).eq("athlete_id", athlete_id).gte(
        "created_at", f"{period_start_s}T00:00:00Z"
    ).lte(
        "created_at", f"{period_end_s}T23:59:59Z"
    ).order("created_at", desc=True).limit(20).execute()
    mem_events = mem_res.data or []
    mem_summary = "\n".join(
        f"- [{e.get('event_type')}] {e.get('content','')[:100]}"
        for e in mem_events[:10]
    ) or "No activity logged this period."

    # ── 2. Build LLM prompt ────────────────────────────────────────────────────

    period_label = f"{period_start.strftime('%b %-d')} – {period_end.strftime('%b %-d, %Y')}"

    system_prompt = (
        "You are an AI assistant helping an endurance sports coach write a training report "
        "for one of their athletes. The coach will review and optionally edit this before publishing. "
        "Write in a warm, direct coaching voice — specific, honest, encouraging without being sycophantic. "
        "Output ONLY a valid JSON object, no markdown, no extra text."
    )

    user_prompt = f"""Athlete: {athlete_name}
Period: {period_label} ({period_type})
Overall compliance: {compliance_pct}% ({completed}/{total_planned} sessions completed)
By sport: {sport_summary}

Workouts this period:
{workout_details}

Athlete activity log:
{mem_summary}

Generate a training report JSON with these exact keys:
- "title": one punchy headline (10 words max, no period)
- "summary_text": 1-2 sentences summarizing the week's story (shown in list view)
- "full_text": 3-5 paragraphs of coaching narrative — week in review, what worked, what to watch, focus for next week. Second person ("you"). Use line breaks between paragraphs.
- "highlights": array of 2-4 specific positive observations (strings)
- "watchouts": array of 1-3 specific concerns or focus areas (strings)
"""

    llm = LLMClient()
    resp = llm.chat_completions(system=system_prompt, user=user_prompt)

    raw = resp.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:].strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.error("[coa118] LLM returned invalid JSON: %s", raw[:200])
        raise RuntimeError(f"LLM returned invalid JSON: {exc}") from exc

    title = str(parsed.get("title", f"Week of {period_start.strftime('%b %-d')}")[:120])
    summary_text = str(parsed.get("summary_text", ""))[:500]
    full_text = str(parsed.get("full_text", ""))[:5000]
    highlights = [str(h)[:200] for h in (parsed.get("highlights") or [])[:6]]
    watchouts = [str(w)[:200] for w in (parsed.get("watchouts") or [])[:4]]

    # Log usage
    try:
        UsageLogger.log_sync(
            supabase=supabase,
            response=UsageLLMResponse(
                content=resp.content,
                input_tokens=resp.input_tokens,
                output_tokens=resp.output_tokens,
                model=resp.model,
                latency_ms=resp.latency_ms,
            ),
            event_type="report_generate",
            coach_id=coach_id,
            athlete_id=athlete_id,
            endpoint="/api/v1/coach/athletes/{id}/reports/generate",
            metadata={"period_start": period_start_s, "period_type": period_type},
        )
    except Exception:
        pass

    # ── 3. Insert draft report ─────────────────────────────────────────────────

    row = {
        "athlete_id": athlete_id,
        "coach_id": coach_id,
        "period_type": period_type,
        "period_start": period_start_s,
        "period_end": period_end_s,
        "title": title,
        "summary_text": summary_text,
        "full_text": full_text,
        "highlights": highlights,
        "watchouts": watchouts,
        "status": "draft",
    }
    result = supabase.table("training_reports").insert(row).execute()
    created = result.data[0] if result.data else row
    logger.info(
        "[coa118] Draft report created: id=%s athlete=%s period=%s–%s",
        str(created.get("id", ""))[:8], athlete_id[:8], period_start_s, period_end_s,
    )
    return created


# ── Coach: generate a report ──────────────────────────────────────────────────

@router.post(
    "/api/v1/coach/athletes/{athlete_id}/reports/generate",
    response_model=TrainingReportOut,
    summary="AI drafts a training report for an athlete (COA-118)",
)
async def generate_report(
    athlete_id: str,
    body: GenerateReportRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Triggers AI generation of a draft training report. Returns the created draft."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    scope = resolve_coach_scope(principal)

    # Verify athlete belongs to coach
    check = supabase.table("athletes").select("id").eq(
        "id", athlete_id
    ).eq("coach_id", scope.coach_id).is_("archived_at", "null").single().execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Resolve period bounds
    if body.period_start and body.period_end:
        try:
            period_start = date.fromisoformat(body.period_start)
            period_end = date.fromisoformat(body.period_end)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid date format") from exc
    else:
        period_start, period_end = _last_week_bounds()

    try:
        row = await run_in_threadpool(
            _generate_report_sync,
            supabase, athlete_id, str(scope.coach_id),
            body.period_type, period_start, period_end,
        )
    except RuntimeError as exc:
        logger.exception("[coa118] Report generation failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("[coa118] Report generation failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Report generation failed") from exc

    return _row_to_out(row)


# ── Coach: list reports for an athlete ────────────────────────────────────────

@router.get(
    "/api/v1/coach/athletes/{athlete_id}/reports",
    response_model=list[TrainingReportOut],
    summary="Coach lists all reports for an athlete (COA-118)",
)
async def coach_list_reports(
    athlete_id: str,
    limit: int = Query(20, ge=1, le=100),
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Returns draft + published reports for an athlete, newest first."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    scope = resolve_coach_scope(principal)

    check = supabase.table("athletes").select("id").eq(
        "id", athlete_id
    ).eq("coach_id", scope.coach_id).single().execute()
    if not check.data:
        raise HTTPException(status_code=404, detail="Athlete not found")

    def _fetch():
        return supabase.table("training_reports").select("*").eq(
            "athlete_id", athlete_id
        ).order("created_at", desc=True).limit(limit).execute()

    try:
        result = await run_in_threadpool(_fetch)
        return [_row_to_out(r) for r in (result.data or [])]
    except Exception as exc:
        logger.exception("[coa118] coach_list_reports failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to list reports") from exc


# ── Coach: edit a draft report ────────────────────────────────────────────────

@router.patch(
    "/api/v1/coach/reports/{report_id}",
    response_model=TrainingReportOut,
    summary="Coach edits a draft report (COA-118)",
)
async def patch_report(
    report_id: str,
    body: PatchReportRequest,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Update title, text, highlights, or watchouts on a draft report."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    scope = resolve_coach_scope(principal)

    # Verify ownership
    existing_res = await run_in_threadpool(lambda: supabase.table("training_reports").select("*").eq(
        "id", report_id
    ).eq("coach_id", str(scope.coach_id)).single().execute())
    existing = existing_res
    if not existing.data:
        raise HTTPException(status_code=404, detail="Report not found")
    if existing.data.get("status") == "published":
        raise HTTPException(status_code=400, detail="Cannot edit a published report")

    payload: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.title is not None:
        payload["title"] = body.title[:120]
    if body.summary_text is not None:
        payload["summary_text"] = body.summary_text[:500]
    if body.full_text is not None:
        payload["full_text"] = body.full_text[:5000]
    if body.highlights is not None:
        payload["highlights"] = [str(h)[:200] for h in body.highlights[:6]]
    if body.watchouts is not None:
        payload["watchouts"] = [str(w)[:200] for w in body.watchouts[:4]]

    if len(payload) == 1:
        return _row_to_out(existing.data)

    def _update():
        return supabase.table("training_reports").update(payload).eq(
            "id", report_id
        ).execute()

    try:
        result = await run_in_threadpool(_update)
        r = result.data[0] if result.data else {**existing.data, **payload}
        return _row_to_out(r)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to update report") from exc


# ── Coach: publish a report ───────────────────────────────────────────────────

@router.post(
    "/api/v1/coach/reports/{report_id}/publish",
    response_model=TrainingReportOut,
    summary="Coach publishes a draft report (COA-118)",
)
async def publish_report(
    report_id: str,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_roles("coach")),
):
    """Sets status=published, records published_at.
    Sends WhatsApp notification to athlete if they have a phone number.
    """
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    scope = resolve_coach_scope(principal)

    existing_res = await run_in_threadpool(lambda: supabase.table("training_reports").select("*").eq(
        "id", report_id
    ).eq("coach_id", str(scope.coach_id)).single().execute())
    existing = existing_res
    if not existing.data:
        raise HTTPException(status_code=404, detail="Report not found")
    if existing.data.get("status") == "published":
        raise HTTPException(status_code=400, detail="Report already published")

    now_iso = datetime.now(timezone.utc).isoformat()

    def _publish():
        return supabase.table("training_reports").update({
            "status": "published",
            "published_at": now_iso,
            "updated_at": now_iso,
        }).eq("id", report_id).execute()

    try:
        result = await run_in_threadpool(_publish)
        r = result.data[0] if result.data else {**existing.data, "status": "published", "published_at": now_iso}
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to publish report") from exc

    # Write to athlete_memory_events (non-fatal)
    try:
        supabase.table("athlete_memory_events").insert({
            "athlete_id": existing.data["athlete_id"],
            "event_type": "report_published",
            "content": f"Coach published report: {existing.data.get('title', 'Training report')}",
            "metadata": {"report_id": report_id, "period_type": existing.data.get("period_type")},
        }).execute()
    except Exception:
        pass

    # WhatsApp notification to athlete (non-fatal)
    try:
        athlete_row = await run_in_threadpool(lambda: supabase.table("athletes").select(
            "full_name, phone_number"
        ).eq("id", existing.data["athlete_id"]).single().execute())
        if athlete_row.data and athlete_row.data.get("phone_number"):
            from app.services.whatsapp_service import WhatsAppRecipient, WhatsAppService
            _wa_client = getattr(request.app.state, "whatsapp_client", None)
            if _wa_client is not None:
                wa = WhatsAppService(whatsapp_client=_wa_client)
                recipient = WhatsAppRecipient(
                    athlete_id=str(existing.data["athlete_id"]),
                    phone_number=athlete_row.data["phone_number"],
                    timezone_name="UTC",
                    display_name=athlete_row.data.get("full_name", "Athlete"),
                )
                await wa.send_text_message(
                    recipient=recipient,
                    body=(
                        f"📊 Your coach published a new training report.\n\n"
                        f"*{existing.data.get('title', 'Training Report')}*\n"
                        f"{existing.data.get('summary_text', '')}\n\n"
                        "View the full report in your dashboard."
                    ),
                )
    except Exception as wa_exc:
        logger.warning("[coa118] WhatsApp notification to athlete failed: %s", wa_exc)

    logger.info("[coa118] Report=%s published by coach=%s", report_id[:8], str(scope.coach_id)[:8])
    return _row_to_out(r)


# ── Athlete: list published reports ──────────────────────────────────────────

@router.get(
    "/api/v1/athlete/reports",
    response_model=list[TrainingReportOut],
    summary="Athlete fetches their published training reports (COA-118)",
)
async def athlete_list_reports(
    limit: int = Query(20, ge=1, le=50),
    principal: AuthenticatedPrincipal = Depends(require_roles("athlete")),
):
    """Returns published reports for the authenticated athlete, newest first."""
    from app.core.supabase import get_supabase_client
    supabase = get_supabase_client()

    athlete_id, _ = resolve_athlete_scope(principal)

    def _fetch():
        return supabase.table("training_reports").select("*").eq(
            "athlete_id", athlete_id
        ).eq("status", "published").order("published_at", desc=True).limit(limit).execute()

    try:
        result = await run_in_threadpool(_fetch)
        return [_row_to_out(r) for r in (result.data or [])]
    except Exception as exc:
        logger.exception("[coa118] athlete_list_reports failed athlete=%s", athlete_id[:8])
        raise HTTPException(status_code=500, detail="Failed to load reports") from exc
