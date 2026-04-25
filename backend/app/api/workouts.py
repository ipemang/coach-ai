"""COA-42 — Workout log + weekly plan view.

Two audiences:
  /dashboard/workouts*  — Coach view (secret-gated)
  /my-plan*             — Athlete view (token-gated via athlete_connect_tokens)
"""
from __future__ import annotations

import html
import inspect
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Two routers — merged into one module-level list for main.py
dashboard_router = APIRouter(prefix="/dashboard/workouts", tags=["workouts-dashboard"])
plan_router = APIRouter(prefix="/my-plan", tags=["workouts-plan"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _e(val: Any) -> str:
    return html.escape(str(val)) if val is not None else ""


def _qs(secret: str | None) -> str:
    return f"?secret={secret}" if secret else ""


def _auth(secret: str | None) -> None:
    expected = getattr(get_settings(), "dashboard_secret", None)
    if not expected:
        raise HTTPException(status_code=503, detail="Dashboard not configured")
    import hmac as _hmac
    if not secret or not _hmac.compare_digest(secret.encode(), expected.encode()):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def _query_rows(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        result = query.execute()
        response = await result if inspect.isawaitable(result) else result
    else:
        response = await query if inspect.isawaitable(query) else query
    if response is None:
        return []
    data = getattr(response, "data", response)
    if isinstance(data, list):
        return [r for r in data if isinstance(r, dict)]
    if isinstance(data, dict):
        return [data]
    return []


def _sync_exec(query: Any) -> Any:
    return query.execute()


async def _get_supabase(request: Request) -> Any:
    return request.app.state.supabase_client


async def _validate_plan_token(supabase: Any, token: str) -> dict | None:
    """Return token row if valid plan_access token (unused restriction waived — plan tokens are reusable)."""
    rows = await _query_rows(
        supabase.table("athlete_connect_tokens")
        .select("*")
        .eq("token", token)
        .eq("purpose", "plan_access")
        .gte("expires_at", "now()")
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Shared HTML helpers
# ---------------------------------------------------------------------------

_SESSION_TYPE_LABELS = {
    "run": "Run", "bike": "Bike", "swim": "Swim",
    "strength": "Strength", "recovery": "Recovery", "brick": "Brick",
    "rest": "Rest Day", "other": "Other",
}

_STATUS_COLORS = {
    "prescribed": ("#dbeafe", "#1e40af"),
    "sent":       ("#fef3c7", "#92400e"),
    "completed":  ("#dcfce7", "#166534"),
    "skipped":    ("#f3f4f6", "#374151"),
    "missed":     ("#fee2e2", "#991b1b"),
}


def _status_badge(status: str) -> str:
    bg, fg = _STATUS_COLORS.get(status, ("#f3f4f6", "#374151"))
    return (
        f'<span style="display:inline-block;padding:2px 8px;border-radius:4px;'
        f'font-size:12px;font-weight:500;background:{bg};color:{fg};">'
        f'{_e(status)}</span>'
    )


def _coach_base_html(title: str, body: str, secret: str | None = None) -> str:
    nav_secret = _qs(secret)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Andesia</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f5f5f5; color: #1a1a1a; line-height: 1.5; }}
  .nav {{ background: #1a1a1a; color: white; padding: 12px 24px;
          display: flex; align-items: center; gap: 24px; }}
  .nav a {{ color: #ccc; text-decoration: none; font-size: 14px; }}
  .nav a:hover {{ color: white; }}
  .nav .brand {{ color: white; font-weight: 600; font-size: 16px; }}
  .container {{ max-width: 900px; margin: 32px auto; padding: 0 24px; }}
  h1 {{ font-size: 24px; font-weight: 600; margin-bottom: 24px; }}
  h2 {{ font-size: 18px; font-weight: 600; margin-bottom: 16px; color: #333; }}
  .card {{ background: white; border-radius: 8px; padding: 24px;
           box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 24px; }}
  .btn {{ display: inline-block; padding: 8px 16px; border-radius: 6px;
          font-size: 14px; font-weight: 500; cursor: pointer; border: none;
          text-decoration: none; }}
  .btn-primary {{ background: #2563eb; color: white; }}
  .btn-primary:hover {{ background: #1d4ed8; }}
  .btn-secondary {{ background: #f3f4f6; color: #374151; }}
  .btn-secondary:hover {{ background: #e5e7eb; }}
  .btn-sm {{ padding: 5px 12px; font-size: 13px; }}
  .btn-danger {{ background: #fee2e2; color: #991b1b; }}
  .btn-danger:hover {{ background: #fecaca; }}
  table {{ width: 100%; border-collapse: collapse; font-size: 14px; }}
  th {{ text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase;
       letter-spacing: 0.05em; color: #6b7280; padding: 8px 12px;
       border-bottom: 2px solid #e5e7eb; }}
  td {{ padding: 10px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }}
  form {{ display: grid; gap: 16px; }}
  .form-group {{ display: grid; gap: 6px; }}
  .form-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  label {{ font-size: 13px; font-weight: 500; color: #374151; }}
  input, select, textarea {{
    width: 100%; padding: 8px 12px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 14px; font-family: inherit; background: white;
  }}
  input:focus, select:focus, textarea:focus {{
    outline: none; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
  }}
  textarea {{ resize: vertical; min-height: 80px; }}
  .hint {{ font-size: 12px; color: #9ca3af; }}
</style>
</head>
<body>
<nav class="nav">
  <span class="brand">Andesia</span>
  <a href="/dashboard{nav_secret}">Athletes</a>
  <a href="/dashboard/workouts{nav_secret}">Workouts</a>
  <a href="/dashboard/coach/settings{nav_secret}">My Settings</a>
</nav>
<div class="container">
{body}
</div>
</body>
</html>"""


def _athlete_plan_html(title: str, body: str) -> str:
    """Dark-themed athlete-facing plan page."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Andesia</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #0f1117; color: #e0e0e0; line-height: 1.5; }}
  .nav {{ background: #1a1d2e; padding: 12px 24px;
          display: flex; align-items: center; gap: 16px; }}
  .nav .brand {{ color: #6c63ff; font-weight: 700; font-size: 18px; }}
  .container {{ max-width: 700px; margin: 32px auto; padding: 0 24px; }}
  h1 {{ font-size: 22px; font-weight: 600; margin-bottom: 20px; color: #fff; }}
  h2 {{ font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #ccc; }}
  .card {{ background: #1a1d2e; border-radius: 10px; padding: 20px;
           margin-bottom: 20px; border: 1px solid #2a2d3e; }}
  .day-label {{ font-size: 13px; font-weight: 600; color: #6c63ff;
                text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }}
  .session-type {{ font-size: 15px; font-weight: 600; color: #fff; margin-bottom: 4px; }}
  .detail {{ font-size: 13px; color: #999; margin-bottom: 2px; }}
  .notes {{ font-size: 13px; color: #bbb; margin-top: 8px; padding-top: 8px;
            border-top: 1px solid #2a2d3e; }}
  .empty {{ color: #666; font-size: 14px; text-align: center; padding: 40px 20px; }}
</style>
</head>
<body>
<nav class="nav">
  <span class="brand">Andesia</span>
</nav>
<div class="container">
{body}
</div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Coach dashboard: workout list
# ---------------------------------------------------------------------------

@dashboard_router.get("", response_class=HTMLResponse)
async def workouts_home(
    request: Request,
    secret: str | None = Query(default=None),
    athlete_id: str | None = Query(default=None),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    # Athlete selector
    athletes = (supabase.table("athletes")
                .select("id, full_name")
                .order("full_name")
                .execute()).data or []

    athlete_options = "".join(
        f'<option value="{_e(a["id"])}" {"selected" if a["id"] == athlete_id else ""}>'
        f'{_e(a.get("full_name", "Unnamed"))}</option>'
        for a in athletes
    )

    # Build workout query
    query = supabase.table("workouts").select("*, athletes(full_name)").order("scheduled_date", desc=True).limit(50)
    if athlete_id:
        query = query.eq("athlete_id", athlete_id)
    rows = await _query_rows(query)

    if rows:
        table_rows = []
        for w in rows:
            athlete_name = ""
            a_data = w.get("athletes")
            if isinstance(a_data, dict):
                athlete_name = a_data.get("full_name", "")
            elif isinstance(a_data, list) and a_data:
                athlete_name = a_data[0].get("full_name", "")
            stype = _SESSION_TYPE_LABELS.get(w.get("session_type", ""), w.get("session_type", ""))
            table_rows.append(f"""<tr>
              <td>{_e(w.get('scheduled_date', ''))}</td>
              <td>{_e(athlete_name)}</td>
              <td>{_e(stype)}</td>
              <td>{_e(w.get('title', ''))}</td>
              <td>{_e(w.get('distance_km', '') or '')} km</td>
              <td>{_e(w.get('duration_min', '') or '')} min</td>
              <td>{_status_badge(w.get('status', 'prescribed'))}</td>
              <td>
                <a href="/dashboard/workouts/{w['id']}/edit{_qs(secret)}" class="btn btn-secondary btn-sm">Edit</a>
              </td>
            </tr>""")
        table_html = f"""<table>
          <thead><tr>
            <th>Date</th><th>Athlete</th><th>Type</th><th>Title</th>
            <th>Distance</th><th>Duration</th><th>Status</th><th></th>
          </tr></thead>
          <tbody>{"".join(table_rows)}</tbody>
        </table>"""
    else:
        table_html = '<p class="hint">No workouts found.</p>'

    body = f"""
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <h1>Workouts</h1>
      <a href="/dashboard/workouts/new{_qs(secret)}" class="btn btn-primary">+ New Workout</a>
    </div>
    <div class="card" style="margin-bottom:16px;">
      <form method="GET" action="/dashboard/workouts" style="display:flex;gap:12px;align-items:end;">
        <input type="hidden" name="secret" value="{_e(secret or '')}">
        <div class="form-group" style="flex:1;">
          <label>Filter by athlete</label>
          <select name="athlete_id">
            <option value="">All athletes</option>
            {athlete_options}
          </select>
        </div>
        <button type="submit" class="btn btn-secondary">Filter</button>
      </form>
    </div>
    <div class="card">{table_html}</div>"""

    return HTMLResponse(_coach_base_html("Workouts", body, secret))


# ---------------------------------------------------------------------------
# Coach: new workout form
# ---------------------------------------------------------------------------

@dashboard_router.get("/new", response_class=HTMLResponse)
async def new_workout_form(
    request: Request,
    secret: str | None = Query(default=None),
    athlete_id: str | None = Query(default=None),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    athletes = (supabase.table("athletes")
                .select("id, full_name")
                .order("full_name")
                .execute()).data or []

    athlete_options = "".join(
        f'<option value="{_e(a["id"])}" {"selected" if a["id"] == athlete_id else ""}>'
        f'{_e(a.get("full_name", "Unnamed"))}</option>'
        for a in athletes
    )

    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    type_options = "".join(
        f'<option value="{k}">{v}</option>' for k, v in _SESSION_TYPE_LABELS.items()
    )

    body = f"""
    <h1>New Workout</h1>
    <div class="card">
      <form method="POST" action="/dashboard/workouts{_qs(secret)}">
        <div class="form-row">
          <div class="form-group">
            <label>Athlete *</label>
            <select name="athlete_id" required>
              <option value="">— select —</option>
              {athlete_options}
            </select>
          </div>
          <div class="form-group">
            <label>Scheduled Date *</label>
            <input type="date" name="scheduled_date" value="{tomorrow}" required>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Session Type</label>
            <select name="session_type">{type_options}</select>
          </div>
          <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" placeholder="Easy Z2 Run">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Distance (km)</label>
            <input type="number" name="distance_km" step="0.1" min="0" placeholder="10.0">
          </div>
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" name="duration_min" min="0" placeholder="60">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>HR Zone</label>
            <input type="text" name="hr_zone" placeholder="Z2">
          </div>
          <div class="form-group">
            <label>Target Pace</label>
            <input type="text" name="target_pace" placeholder="5:30/km">
          </div>
        </div>
        <div class="form-group">
          <label>Coaching Notes</label>
          <textarea name="coaching_notes" placeholder="Keep it easy, focus on cadence"></textarea>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Create Workout</button>
          <a href="/dashboard/workouts{_qs(secret)}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>"""

    return HTMLResponse(_coach_base_html("New Workout", body, secret))


# ---------------------------------------------------------------------------
# Coach: create workout (POST)
# ---------------------------------------------------------------------------

@dashboard_router.post("", response_class=HTMLResponse)
async def create_workout(
    request: Request,
    secret: str | None = Query(default=None),
    athlete_id: str = Form(...),
    scheduled_date: str = Form(...),
    session_type: str = Form(default="run"),
    title: str = Form(default=""),
    distance_km: str = Form(default=""),
    duration_min: str = Form(default=""),
    hr_zone: str = Form(default=""),
    target_pace: str = Form(default=""),
    coaching_notes: str = Form(default=""),
):
    _auth(secret)
    supabase = await _get_supabase(request)
    settings = get_settings()

    coach_id = getattr(settings, "coach_id", None)

    payload: dict[str, Any] = {
        "athlete_id": athlete_id,
        "coach_id": coach_id,
        "scheduled_date": scheduled_date,
        "session_type": session_type,
        "status": "prescribed",
    }
    if title.strip():
        payload["title"] = title.strip()
    if distance_km.strip():
        payload["distance_km"] = float(distance_km)
    if duration_min.strip():
        payload["duration_min"] = int(duration_min)
    if hr_zone.strip():
        payload["hr_zone"] = hr_zone.strip()
    if target_pace.strip():
        payload["target_pace"] = target_pace.strip()
    if coaching_notes.strip():
        payload["coaching_notes"] = coaching_notes.strip()

    _sync_exec(supabase.table("workouts").insert(payload))
    logger.info("[workouts] Created workout for athlete %s on %s", athlete_id, scheduled_date)

    return RedirectResponse(f"/dashboard/workouts{_qs(secret)}&created=1", status_code=303)


# ---------------------------------------------------------------------------
# Coach: edit workout form
# ---------------------------------------------------------------------------

@dashboard_router.get("/{workout_id}/edit", response_class=HTMLResponse)
async def edit_workout_form(
    workout_id: str,
    request: Request,
    secret: str | None = Query(default=None),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    rows = await _query_rows(
        supabase.table("workouts").select("*").eq("id", workout_id)
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Workout not found")
    w = rows[0]

    type_options = "".join(
        f'<option value="{k}" {"selected" if k == w.get("session_type") else ""}>{v}</option>'
        for k, v in _SESSION_TYPE_LABELS.items()
    )

    status_options = "".join(
        f'<option value="{s}" {"selected" if s == w.get("status") else ""}>{s}</option>'
        for s in ("prescribed", "sent", "completed", "skipped", "missed")
    )

    body = f"""
    <h1>Edit Workout</h1>
    <div class="card">
      <form method="POST" action="/dashboard/workouts/{workout_id}{_qs(secret)}">
        <div class="form-row">
          <div class="form-group">
            <label>Scheduled Date *</label>
            <input type="date" name="scheduled_date" value="{_e(w.get('scheduled_date', ''))}" required>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select name="status">{status_options}</select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Session Type</label>
            <select name="session_type">{type_options}</select>
          </div>
          <div class="form-group">
            <label>Title</label>
            <input type="text" name="title" value="{_e(w.get('title', ''))}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Distance (km)</label>
            <input type="number" name="distance_km" step="0.1" min="0"
                   value="{_e(w.get('distance_km', '') or '')}">
          </div>
          <div class="form-group">
            <label>Duration (min)</label>
            <input type="number" name="duration_min" min="0"
                   value="{_e(w.get('duration_min', '') or '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>HR Zone</label>
            <input type="text" name="hr_zone" value="{_e(w.get('hr_zone', ''))}">
          </div>
          <div class="form-group">
            <label>Target Pace</label>
            <input type="text" name="target_pace" value="{_e(w.get('target_pace', ''))}">
          </div>
        </div>
        <div class="form-group">
          <label>Coaching Notes</label>
          <textarea name="coaching_notes">{_e(w.get('coaching_notes', ''))}</textarea>
        </div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Save Changes</button>
          <a href="/dashboard/workouts{_qs(secret)}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>"""

    return HTMLResponse(_coach_base_html("Edit Workout", body, secret))


# ---------------------------------------------------------------------------
# Coach: update workout (POST)
# ---------------------------------------------------------------------------

@dashboard_router.post("/{workout_id}", response_class=HTMLResponse)
async def update_workout(
    workout_id: str,
    request: Request,
    secret: str | None = Query(default=None),
    scheduled_date: str = Form(...),
    session_type: str = Form(default="run"),
    title: str = Form(default=""),
    distance_km: str = Form(default=""),
    duration_min: str = Form(default=""),
    hr_zone: str = Form(default=""),
    target_pace: str = Form(default=""),
    coaching_notes: str = Form(default=""),
    status: str = Form(default="prescribed"),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    payload: dict[str, Any] = {
        "scheduled_date": scheduled_date,
        "session_type": session_type,
        "title": title.strip() or None,
        "distance_km": float(distance_km) if distance_km.strip() else None,
        "duration_min": int(duration_min) if duration_min.strip() else None,
        "hr_zone": hr_zone.strip() or None,
        "target_pace": target_pace.strip() or None,
        "coaching_notes": coaching_notes.strip() or None,
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if status == "completed":
        payload["completed_at"] = datetime.now(timezone.utc).isoformat()

    _sync_exec(supabase.table("workouts").update(payload).eq("id", workout_id))
    logger.info("[workouts] Updated workout %s", workout_id)

    return RedirectResponse(f"/dashboard/workouts{_qs(secret)}", status_code=303)


# ---------------------------------------------------------------------------
# Athlete: /my-plan — weekly plan view (token-gated, NO secret)
# ---------------------------------------------------------------------------

@plan_router.get("", response_class=HTMLResponse)
async def my_plan(
    request: Request,
    token: str = Query(...),
    week_offset: int = Query(default=0),
):
    supabase = await _get_supabase(request)

    token_row = await _validate_plan_token(supabase, token)
    if not token_row:
        return HTMLResponse(
            _athlete_plan_html("Invalid Link", '<div class="empty">This plan link is invalid or has expired.</div>'),
            status_code=403,
        )

    athlete_id = token_row["athlete_id"]

    # Get athlete info
    athlete_rows = await _query_rows(
        supabase.table("athletes").select("full_name").eq("id", athlete_id)
    )
    athlete_name = athlete_rows[0].get("full_name", "Athlete") if athlete_rows else "Athlete"

    # Calculate week boundaries (Mon-Sun)
    today = date.today()
    monday = today - timedelta(days=today.weekday()) + timedelta(weeks=week_offset)
    sunday = monday + timedelta(days=6)

    workouts = await _query_rows(
        supabase.table("workouts")
        .select("*")
        .eq("athlete_id", athlete_id)
        .gte("scheduled_date", monday.isoformat())
        .lte("scheduled_date", sunday.isoformat())
        .order("scheduled_date")
    )

    # Group by day
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    days_html = []
    for i in range(7):
        d = monday + timedelta(days=i)
        day_workouts = [w for w in workouts if w.get("scheduled_date") == d.isoformat()]
        is_today = d == today

        if day_workouts:
            cards = []
            for w in day_workouts:
                stype = _SESSION_TYPE_LABELS.get(w.get("session_type", ""), w.get("session_type", ""))
                details = []
                if w.get("distance_km"):
                    details.append(f"{_e(w['distance_km'])} km")
                if w.get("duration_min"):
                    details.append(f"{_e(w['duration_min'])} min")
                if w.get("hr_zone"):
                    details.append(f"Zone: {_e(w['hr_zone'])}")
                if w.get("target_pace"):
                    details.append(f"Pace: {_e(w['target_pace'])}")

                title_html = f'<div class="session-type">{_e(w.get("title") or stype)}</div>'
                if w.get("title"):
                    title_html += f'<div class="detail">{_e(stype)}</div>'
                details_html = " · ".join(details)
                notes_html = f'<div class="notes">{_e(w["coaching_notes"])}</div>' if w.get("coaching_notes") else ""

                cards.append(f"""
                <div style="margin-bottom:8px;">
                  {title_html}
                  <div class="detail">{details_html}</div>
                  {notes_html}
                </div>""")

            content = "".join(cards)
        else:
            content = '<div class="detail" style="color:#555;">Rest day</div>'

        today_marker = ' style="border-left:3px solid #6c63ff;"' if is_today else ""
        days_html.append(f"""
        <div class="card"{today_marker}>
          <div class="day-label">{day_names[i]} — {d.strftime('%b %d')}</div>
          {content}
        </div>""")

    prev_offset = week_offset - 1
    next_offset = week_offset + 1
    week_label = f"{monday.strftime('%b %d')} – {sunday.strftime('%b %d, %Y')}"

    nav_html = f"""
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
      <a href="/my-plan?token={_e(token)}&week_offset={prev_offset}"
         style="color:#6c63ff;text-decoration:none;font-size:14px;">&larr; Previous</a>
      <span style="font-size:14px;color:#888;">{week_label}</span>
      <a href="/my-plan?token={_e(token)}&week_offset={next_offset}"
         style="color:#6c63ff;text-decoration:none;font-size:14px;">Next &rarr;</a>
    </div>"""

    body = f"""
    <h1>Training Plan — {_e(athlete_name)}</h1>
    {nav_html}
    {"".join(days_html)}
    {nav_html}"""

    return HTMLResponse(_athlete_plan_html("My Plan", body))
