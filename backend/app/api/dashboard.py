"""Coach dashboard — athlete profile management (COA-24).

Served directly from FastAPI as HTML. No separate frontend needed.
Protected by DASHBOARD_SECRET env var passed as ?secret= query param.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Form, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.config import get_settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_TIMEZONES = [
    "UTC", "America/New_York", "America/Chicago", "America/Denver",
    "America/Los_Angeles", "America/Sao_Paulo", "Europe/London",
    "Europe/Paris", "Europe/Madrid", "Asia/Tokyo", "Australia/Sydney",
]

_PHASES = ["base", "build", "peak", "taper", "recovery", "off_season"]


def _auth(secret: str | None) -> None:
    settings = get_settings()
    expected = getattr(settings, "dashboard_secret", None)
    if expected and secret != expected:
        raise HTTPException(status_code=401, detail="Invalid dashboard secret")


def _qs(secret: str | None) -> str:
    return f"?secret={secret}" if secret else ""


def _base_html(title: str, body: str, secret: str | None = None) -> str:
    nav_secret = _qs(secret)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — Coach.AI</title>
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
  .athlete-list {{ display: grid; gap: 12px; }}
  .athlete-item {{ background: white; border-radius: 8px; padding: 16px 20px;
                   box-shadow: 0 1px 3px rgba(0,0,0,0.08);
                   display: flex; justify-content: space-between; align-items: center; }}
  .athlete-name {{ font-weight: 500; }}
  .athlete-meta {{ font-size: 13px; color: #666; margin-top: 2px; }}
  .btn {{ display: inline-block; padding: 8px 16px; border-radius: 6px;
          font-size: 14px; font-weight: 500; cursor: pointer; border: none;
          text-decoration: none; }}
  .btn-primary {{ background: #2563eb; color: white; }}
  .btn-primary:hover {{ background: #1d4ed8; }}
  .btn-secondary {{ background: #f3f4f6; color: #374151; }}
  .btn-secondary:hover {{ background: #e5e7eb; }}
  .btn-sm {{ padding: 5px 12px; font-size: 13px; }}
  .actions {{ display: flex; gap: 8px; }}
  form {{ display: grid; gap: 16px; }}
  .form-group {{ display: grid; gap: 6px; }}
  .form-row {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
  label {{ font-size: 13px; font-weight: 500; color: #374151; }}
  input, select, textarea {{
    width: 100%; padding: 8px 12px; border: 1px solid #d1d5db;
    border-radius: 6px; font-size: 14px; font-family: inherit;
    background: white;
  }}
  input:focus, select:focus, textarea:focus {{
    outline: none; border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
  }}
  textarea {{ resize: vertical; min-height: 80px; }}
  .section-title {{ font-size: 12px; font-weight: 600; text-transform: uppercase;
                    letter-spacing: 0.05em; color: #6b7280; margin-top: 8px;
                    padding-bottom: 8px; border-bottom: 1px solid #e5e7eb; }}
  .hint {{ font-size: 12px; color: #9ca3af; }}
  .success {{ background: #dcfce7; color: #166534; padding: 12px 16px;
              border-radius: 6px; margin-bottom: 16px; font-size: 14px; }}
  .badge {{ display: inline-block; padding: 2px 8px; border-radius: 4px;
            font-size: 12px; font-weight: 500; }}
  .badge-base {{ background: #dbeafe; color: #1e40af; }}
  .badge-build {{ background: #fef3c7; color: #92400e; }}
  .badge-peak {{ background: #fee2e2; color: #991b1b; }}
  .badge-taper {{ background: #f3e8ff; color: #6b21a8; }}
  .badge-default {{ background: #f3f4f6; color: #374151; }}
</style>
</head>
<body>
<nav class="nav">
  <span class="brand">Coach.AI</span>
  <a href="/dashboard{nav_secret}">Athletes</a>
  <a href="/dashboard/coach/settings{nav_secret}">My Settings</a>
</nav>
<div class="container">
{body}
</div>
</body>
</html>"""


def _phase_badge(phase: str) -> str:
    cls = f"badge-{phase}" if phase in ("base", "build", "peak", "taper") else "badge-default"
    return f'<span class="badge {cls}">{phase}</span>' if phase else ""


async def _get_supabase(request: Request) -> Any:
    return request.app.state.supabase_client


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_class=HTMLResponse)
async def dashboard_home(request: Request, secret: str | None = Query(default=None)):
    _auth(secret)
    supabase = await _get_supabase(request)

    rows = supabase.table("athletes").select(
        "id, full_name, phone_number, timezone_name, current_state, stable_profile, coach_id"
    ).execute()
    athletes = rows.data or []

    if not athletes:
        athlete_html = '<p style="color:#6b7280;font-size:14px;">No athletes yet. Add your first one.</p>'
    else:
        items = []
        for a in athletes:
            cs = a.get("current_state") or {}
            sp = a.get("stable_profile") or {}
            phase = cs.get("training_phase", "")
            race = sp.get("target_race", "")
            badge = _phase_badge(phase)
            meta_parts = []
            if a.get("phone_number"):
                meta_parts.append(a["phone_number"])
            if race:
                meta_parts.append(race)
            if cs.get("training_week"):
                meta_parts.append(f"Week {cs['training_week']}")
            meta = " · ".join(meta_parts)
            items.append(f"""
            <div class="athlete-item">
              <div>
                <div class="athlete-name">{a.get('full_name', 'Unnamed')} {badge}</div>
                <div class="athlete-meta">{meta}</div>
              </div>
              <div class="actions">
                <a href="/dashboard/athletes/{a['id']}/edit{_qs(secret)}" class="btn btn-secondary btn-sm">Edit Profile</a>
                <a href="/dashboard/athletes/{a['id']}/state{_qs(secret)}" class="btn btn-primary btn-sm">Update State</a>
              </div>
            </div>""")
        athlete_html = '<div class="athlete-list">' + "".join(items) + "</div>"

    body = f"""
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;">
      <h1>Athletes ({len(athletes)})</h1>
      <a href="/dashboard/athletes/new{_qs(secret)}" class="btn btn-primary">+ New Athlete</a>
    </div>
    <div class="card">
      {athlete_html}
    </div>"""
    return HTMLResponse(_base_html("Athletes", body, secret))


@router.get("/athletes/new", response_class=HTMLResponse)
async def new_athlete_form(secret: str | None = Query(default=None)):
    _auth(secret)
    tz_options = "".join(f'<option value="{tz}">{tz}</option>' for tz in _TIMEZONES)
    body = f"""
    <h1>New Athlete</h1>
    <div class="card">
      <form method="POST" action="/dashboard/athletes{_qs(secret)}">
        <p class="section-title">Identity</p>
        <div class="form-row">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" name="full_name" required placeholder="Jane Smith">
          </div>
          <div class="form-group">
            <label>WhatsApp Phone *</label>
            <input type="text" name="phone_number" required placeholder="+12035853086">
            <span class="hint">Include country code, e.g. +1...</span>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Timezone</label>
            <select name="timezone_name">{tz_options}</select>
          </div>
          <div class="form-group">
            <label>Email (optional)</label>
            <input type="email" name="email" placeholder="jane@example.com">
          </div>
        </div>

        <p class="section-title" style="margin-top:16px;">Race Profile</p>
        <div class="form-row">
          <div class="form-group">
            <label>Target Race</label>
            <input type="text" name="target_race" placeholder="Ironman 70.3">
          </div>
          <div class="form-group">
            <label>Race Date</label>
            <input type="date" name="race_date">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Max Weekly Hours</label>
            <input type="number" name="max_weekly_hours" placeholder="13" step="0.5" min="1" max="40">
          </div>
          <div class="form-group">
            <label>Swim CSS Pace (/100m)</label>
            <input type="text" name="swim_css" placeholder="1:50">
          </div>
        </div>

        <p class="section-title" style="margin-top:16px;">Run HR Zones (bpm)</p>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">
          <div class="form-group"><label>Z1</label><input type="text" name="zone_run_z1" placeholder="111-133"></div>
          <div class="form-group"><label>Z2</label><input type="text" name="zone_run_z2" placeholder="133-150"></div>
          <div class="form-group"><label>Z3</label><input type="text" name="zone_run_z3" placeholder="150-164"></div>
          <div class="form-group"><label>Z4</label><input type="text" name="zone_run_z4" placeholder="164-192"></div>
          <div class="form-group"><label>Z5</label><input type="text" name="zone_run_z5" placeholder="192+"></div>
        </div>

        <p class="section-title" style="margin-top:16px;">Background</p>
        <div class="form-row">
          <div class="form-group">
            <label>Wearable Devices</label>
            <input type="text" name="wearables" placeholder="oura, garmin">
            <span class="hint">Comma-separated</span>
          </div>
          <div class="form-group">
            <label>Years of Experience</label>
            <input type="number" name="years_experience" placeholder="4" min="0">
          </div>
        </div>
        <div class="form-group">
          <label>Injury History</label>
          <textarea name="injury_history" placeholder="Left knee tendinopathy 2024, resolved"></textarea>
        </div>
        <div class="form-group">
          <label>Coach Notes</label>
          <textarea name="notes" placeholder="Does not respond well to back-to-back threshold days"></textarea>
        </div>

        <p class="section-title" style="margin-top:16px;">Current State</p>
        <div class="form-row">
          <div class="form-group">
            <label>Training Phase</label>
            <select name="training_phase">
              <option value="">— select —</option>
              {"".join(f'<option value="{p}">{p.capitalize()}</option>' for p in _PHASES)}
            </select>
          </div>
          <div class="form-group">
            <label>Training Week #</label>
            <input type="number" name="training_week" placeholder="1" min="1">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Oura Personal Access Token</label>
            <input type="text" name="oura_token" placeholder="Paste PAT from cloud.ouraring.com">
            <span class="hint">Optional — enables automatic daily readiness sync</span>
          </div>
        </div>

        <div style="display:flex;gap:12px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Create Athlete</button>
          <a href="/dashboard{_qs(secret)}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>"""
    return HTMLResponse(_base_html("New Athlete", body, secret))


@router.post("/athletes", response_class=HTMLResponse)
async def create_athlete(
    request: Request,
    secret: str | None = Query(default=None),
    full_name: str = Form(...),
    phone_number: str = Form(...),
    timezone_name: str = Form(default="UTC"),
    email: str = Form(default=""),
    target_race: str = Form(default=""),
    race_date: str = Form(default=""),
    max_weekly_hours: str = Form(default=""),
    swim_css: str = Form(default=""),
    zone_run_z1: str = Form(default=""),
    zone_run_z2: str = Form(default=""),
    zone_run_z3: str = Form(default=""),
    zone_run_z4: str = Form(default=""),
    zone_run_z5: str = Form(default=""),
    wearables: str = Form(default=""),
    years_experience: str = Form(default=""),
    injury_history: str = Form(default=""),
    notes: str = Form(default=""),
    training_phase: str = Form(default=""),
    training_week: str = Form(default=""),
    oura_token: str = Form(default=""),
):
    _auth(secret)
    supabase = await _get_supabase(request)
    settings = get_settings()

    # Get coach id
    coach_rows = supabase.table("coaches").select("id").limit(1).execute()
    coach_id = coach_rows.data[0]["id"] if coach_rows.data else settings.coach_id

    stable_profile = {
        "target_race": target_race,
        "race_date": race_date,
        "max_weekly_hours": float(max_weekly_hours) if max_weekly_hours else None,
        "swim_css": swim_css,
        "training_zones": {
            "run": {
                "z1": zone_run_z1, "z2": zone_run_z2, "z3": zone_run_z3,
                "z4": zone_run_z4, "z5": zone_run_z5,
            }
        },
        "wearables": [w.strip() for w in wearables.split(",") if w.strip()],
        "years_experience": int(years_experience) if years_experience else None,
        "injury_history": injury_history,
        "notes": notes,
    }
    # Remove empty values
    stable_profile = {k: v for k, v in stable_profile.items() if v not in (None, "", [], {})}

    current_state = {}
    if training_phase:
        current_state["training_phase"] = training_phase
    if training_week:
        current_state["training_week"] = int(training_week)

    athlete_payload = {
        "full_name": full_name,
        "phone_number": phone_number.strip(),
        "timezone_name": timezone_name,
        "coach_id": coach_id,
        "stable_profile": stable_profile,
        "current_state": current_state,
    }
    if email:
        athlete_payload["email"] = email

    result = supabase.table("athletes").insert(athlete_payload).execute()
    athlete_id = result.data[0]["id"] if result.data else None

    # Store Oura PAT if provided
    if oura_token.strip() and athlete_id:
        supabase.table("oura_tokens").upsert({
            "athlete_id": athlete_id,
            "access_token": oura_token.strip(),
        }, on_conflict="athlete_id").execute()

    logger.info("[dashboard] Created athlete %s id=%s", full_name, athlete_id)
    return RedirectResponse(f"/dashboard{_qs(secret)}&created=1", status_code=303)


@router.get("/athletes/{athlete_id}/edit", response_class=HTMLResponse)
async def edit_athlete_form(
    athlete_id: str,
    request: Request,
    secret: str | None = Query(default=None),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    rows = supabase.table("athletes").select("*").eq("id", athlete_id).execute()
    if not rows.data:
        raise HTTPException(status_code=404, detail="Athlete not found")
    a = rows.data[0]
    sp = a.get("stable_profile") or {}
    zones = sp.get("training_zones", {}).get("run", {})
    wearables_str = ", ".join(sp.get("wearables", []))

    tz_options = "".join(
        f'<option value="{tz}" {"selected" if tz == a.get("timezone_name") else ""}>{tz}</option>'
        for tz in _TIMEZONES
    )

    body = f"""
    <h1>Edit Athlete: {a.get('full_name', '')}</h1>
    <div class="card">
      <form method="POST" action="/dashboard/athletes/{athlete_id}{_qs(secret)}">
        <p class="section-title">Identity</p>
        <div class="form-row">
          <div class="form-group">
            <label>Full Name *</label>
            <input type="text" name="full_name" required value="{a.get('full_name', '')}">
          </div>
          <div class="form-group">
            <label>WhatsApp Phone *</label>
            <input type="text" name="phone_number" required value="{a.get('phone_number', '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Timezone</label>
            <select name="timezone_name">{tz_options}</select>
          </div>
          <div class="form-group">
            <label>Email</label>
            <input type="email" name="email" value="{a.get('email', '')}">
          </div>
        </div>

        <p class="section-title" style="margin-top:16px;">Race Profile</p>
        <div class="form-row">
          <div class="form-group">
            <label>Target Race</label>
            <input type="text" name="target_race" value="{sp.get('target_race', '')}">
          </div>
          <div class="form-group">
            <label>Race Date</label>
            <input type="date" name="race_date" value="{sp.get('race_date', '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Max Weekly Hours</label>
            <input type="number" name="max_weekly_hours" value="{sp.get('max_weekly_hours', '')}" step="0.5">
          </div>
          <div class="form-group">
            <label>Swim CSS Pace</label>
            <input type="text" name="swim_css" value="{sp.get('swim_css', '')}">
          </div>
        </div>

        <p class="section-title" style="margin-top:16px;">Run HR Zones</p>
        <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;">
          <div class="form-group"><label>Z1</label><input type="text" name="zone_run_z1" value="{zones.get('z1', '')}"></div>
          <div class="form-group"><label>Z2</label><input type="text" name="zone_run_z2" value="{zones.get('z2', '')}"></div>
          <div class="form-group"><label>Z3</label><input type="text" name="zone_run_z3" value="{zones.get('z3', '')}"></div>
          <div class="form-group"><label>Z4</label><input type="text" name="zone_run_z4" value="{zones.get('z4', '')}"></div>
          <div class="form-group"><label>Z5</label><input type="text" name="zone_run_z5" value="{zones.get('z5', '')}"></div>
        </div>

        <p class="section-title" style="margin-top:16px;">Background</p>
        <div class="form-row">
          <div class="form-group">
            <label>Wearable Devices</label>
            <input type="text" name="wearables" value="{wearables_str}">
          </div>
          <div class="form-group">
            <label>Years of Experience</label>
            <input type="number" name="years_experience" value="{sp.get('years_experience', '')}">
          </div>
        </div>
        <div class="form-group">
          <label>Injury History</label>
          <textarea name="injury_history">{sp.get('injury_history', '')}</textarea>
        </div>
        <div class="form-group">
          <label>Coach Notes</label>
          <textarea name="notes">{sp.get('notes', '')}</textarea>
        </div>

        <div style="display:flex;gap:12px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Save Profile</button>
          <a href="/dashboard{_qs(secret)}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>"""
    return HTMLResponse(_base_html(f"Edit {a.get('full_name', '')}", body, secret))


@router.post("/athletes/{athlete_id}", response_class=HTMLResponse)
async def update_athlete(
    athlete_id: str,
    request: Request,
    secret: str | None = Query(default=None),
    full_name: str = Form(...),
    phone_number: str = Form(...),
    timezone_name: str = Form(default="UTC"),
    email: str = Form(default=""),
    target_race: str = Form(default=""),
    race_date: str = Form(default=""),
    max_weekly_hours: str = Form(default=""),
    swim_css: str = Form(default=""),
    zone_run_z1: str = Form(default=""),
    zone_run_z2: str = Form(default=""),
    zone_run_z3: str = Form(default=""),
    zone_run_z4: str = Form(default=""),
    zone_run_z5: str = Form(default=""),
    wearables: str = Form(default=""),
    years_experience: str = Form(default=""),
    injury_history: str = Form(default=""),
    notes: str = Form(default=""),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    stable_profile = {
        "target_race": target_race,
        "race_date": race_date,
        "max_weekly_hours": float(max_weekly_hours) if max_weekly_hours else None,
        "swim_css": swim_css,
        "training_zones": {"run": {
            "z1": zone_run_z1, "z2": zone_run_z2, "z3": zone_run_z3,
            "z4": zone_run_z4, "z5": zone_run_z5,
        }},
        "wearables": [w.strip() for w in wearables.split(",") if w.strip()],
        "years_experience": int(years_experience) if years_experience else None,
        "injury_history": injury_history,
        "notes": notes,
    }
    stable_profile = {k: v for k, v in stable_profile.items() if v not in (None, "", [], {})}

    update_payload: dict = {"full_name": full_name, "phone_number": phone_number.strip(),
                             "timezone_name": timezone_name, "stable_profile": stable_profile}
    if email:
        update_payload["email"] = email

    supabase.table("athletes").update(update_payload).eq("id", athlete_id).execute()
    logger.info("[dashboard] Updated athlete %s", athlete_id)
    return RedirectResponse(f"/dashboard{_qs(secret)}&saved=1", status_code=303)


@router.get("/athletes/{athlete_id}/state", response_class=HTMLResponse)
async def update_state_form(
    athlete_id: str,
    request: Request,
    secret: str | None = Query(default=None),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    rows = supabase.table("athletes").select("*").eq("id", athlete_id).execute()
    if not rows.data:
        raise HTTPException(status_code=404, detail="Athlete not found")
    a = rows.data[0]
    cs = a.get("current_state") or {}

    # Check for existing Oura token
    oura_rows = supabase.table("oura_tokens").select("access_token").eq("athlete_id", athlete_id).execute()
    oura_token_val = oura_rows.data[0]["access_token"] if oura_rows.data else ""

    phase_options = "".join(
        f'<option value="{p}" {"selected" if p == cs.get("training_phase") else ""}>{p.capitalize()}</option>'
        for p in _PHASES
    )

    body = f"""
    <h1>Update State: {a.get('full_name', '')}</h1>
    <div class="card">
      <form method="POST" action="/dashboard/athletes/{athlete_id}/state{_qs(secret)}">
        <p class="section-title">Training Status</p>
        <div class="form-row">
          <div class="form-group">
            <label>Training Phase</label>
            <select name="training_phase">
              <option value="">— select —</option>
              {phase_options}
            </select>
          </div>
          <div class="form-group">
            <label>Training Week #</label>
            <input type="number" name="training_week" value="{cs.get('training_week', '')}" min="1">
          </div>
        </div>

        <p class="section-title" style="margin-top:16px;">Biometrics (manual entry)</p>
        <div class="form-row">
          <div class="form-group">
            <label>Last Readiness Score (0–100)</label>
            <input type="number" name="last_readiness_score" value="{cs.get('last_readiness_score', '')}" min="0" max="100">
          </div>
          <div class="form-group">
            <label>Last HRV (ms)</label>
            <input type="number" name="last_hrv" value="{cs.get('last_hrv', '')}" min="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Last Sleep Score (0–100)</label>
            <input type="number" name="last_sleep_score" value="{cs.get('last_sleep_score', '')}" min="0" max="100">
          </div>
          <div class="form-group">
            <label>Missed Workouts This Week</label>
            <input type="number" name="missed_workouts" value="{cs.get('missed_workouts_this_week', '')}" min="0">
          </div>
        </div>
        <div class="form-group">
          <label>Soreness Notes</label>
          <input type="text" name="soreness" value="{cs.get('soreness', '')}" placeholder="Moderate left calf">
        </div>
        <div class="form-group">
          <label>Coach Notes</label>
          <textarea name="coach_notes">{cs.get('coach_notes', '')}</textarea>
        </div>

        <p class="section-title" style="margin-top:16px;">Oura Integration</p>
        <div class="form-group">
          <label>Oura Personal Access Token</label>
          <input type="text" name="oura_token" value="{oura_token_val}" placeholder="Paste from cloud.ouraring.com/personal-access-tokens">
          <span class="hint">Stored securely. Used for automatic daily readiness sync (COA-26).</span>
        </div>

        <div style="display:flex;gap:12px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Save State</button>
          <a href="/dashboard{_qs(secret)}" class="btn btn-secondary">Cancel</a>
        </div>
      </form>
    </div>"""
    return HTMLResponse(_base_html(f"State — {a.get('full_name', '')}", body, secret))


@router.post("/athletes/{athlete_id}/state", response_class=HTMLResponse)
async def save_athlete_state(
    athlete_id: str,
    request: Request,
    secret: str | None = Query(default=None),
    training_phase: str = Form(default=""),
    training_week: str = Form(default=""),
    last_readiness_score: str = Form(default=""),
    last_hrv: str = Form(default=""),
    last_sleep_score: str = Form(default=""),
    missed_workouts: str = Form(default=""),
    soreness: str = Form(default=""),
    coach_notes: str = Form(default=""),
    oura_token: str = Form(default=""),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    current_state: dict = {}
    if training_phase:
        current_state["training_phase"] = training_phase
    if training_week:
        current_state["training_week"] = int(training_week)
    if last_readiness_score:
        current_state["last_readiness_score"] = int(last_readiness_score)
    if last_hrv:
        current_state["last_hrv"] = int(last_hrv)
    if last_sleep_score:
        current_state["last_sleep_score"] = int(last_sleep_score)
    if missed_workouts:
        current_state["missed_workouts_this_week"] = int(missed_workouts)
    if soreness:
        current_state["soreness"] = soreness
    if coach_notes:
        current_state["coach_notes"] = coach_notes

    supabase.table("athletes").update({"current_state": current_state}).eq("id", athlete_id).execute()

    if oura_token.strip():
        supabase.table("oura_tokens").upsert({
            "athlete_id": athlete_id,
            "access_token": oura_token.strip(),
        }, on_conflict="athlete_id").execute()

    logger.info("[dashboard] Updated current_state for athlete %s", athlete_id)
    return RedirectResponse(f"/dashboard{_qs(secret)}&saved=1", status_code=303)


@router.get("/coach/settings", response_class=HTMLResponse)
async def coach_settings_form(
    request: Request,
    secret: str | None = Query(default=None),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    rows = supabase.table("coaches").select("*").limit(1).execute()
    coach = rows.data[0] if rows.data else {}
    playbook = coach.get("methodology_playbook") or {}
    persona = coach.get("persona_system_prompt") or ""
    playbook_json = json.dumps(playbook, indent=2) if playbook else ""

    body = f"""
    <h1>Coach Settings</h1>
    <div class="card">
      <form method="POST" action="/dashboard/coach/settings{_qs(secret)}">
        <p class="section-title">Methodology Playbook</p>
        <div class="form-group">
          <label>Playbook (JSON)</label>
          <textarea name="methodology_playbook" style="min-height:200px;font-family:monospace;font-size:13px;">{playbook_json}</textarea>
          <span class="hint">Define periodization rules, zones, intensity system, and coaching rules as JSON.</span>
        </div>

        <p class="section-title" style="margin-top:16px;">AI Persona Prompt</p>
        <div class="form-group">
          <label>System Prompt</label>
          <textarea name="persona_system_prompt" style="min-height:120px;">{persona}</textarea>
          <span class="hint">How the AI should speak as your coaching voice. Tone, style, what to emphasize.</span>
        </div>

        <div style="display:flex;gap:12px;margin-top:8px;">
          <button type="submit" class="btn btn-primary">Save Settings</button>
        </div>
      </form>
    </div>"""
    return HTMLResponse(_base_html("Coach Settings", body, secret))


@router.post("/coach/settings", response_class=HTMLResponse)
async def save_coach_settings(
    request: Request,
    secret: str | None = Query(default=None),
    methodology_playbook: str = Form(default=""),
    persona_system_prompt: str = Form(default=""),
):
    _auth(secret)
    supabase = await _get_supabase(request)

    rows = supabase.table("coaches").select("id").limit(1).execute()
    if not rows.data:
        raise HTTPException(status_code=404, detail="No coach record found")
    coach_id = rows.data[0]["id"]

    playbook = {}
    if methodology_playbook.strip():
        try:
            playbook = json.loads(methodology_playbook)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Methodology playbook must be valid JSON")

    supabase.table("coaches").update({
        "methodology_playbook": playbook,
        "persona_system_prompt": persona_system_prompt,
    }).eq("id", coach_id).execute()

    logger.info("[dashboard] Updated coach settings for %s", coach_id)
    return RedirectResponse(f"/dashboard/coach/settings{_qs(secret)}&saved=1", status_code=303)
