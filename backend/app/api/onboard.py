"""COA-40 — Web Onboarding Flow.

Maxiom-style multi-step athlete intake at /onboard?token=...
Public route, authenticated by a single-use invite token (athlete_connect_tokens).
Collects full athlete profile across 5 sections, then calls _complete_onboarding().
"""
from __future__ import annotations

import html
import inspect
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Form, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from app.core.config import get_settings

router = APIRouter(prefix="/onboard", tags=["onboard"])
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Step definitions
# ---------------------------------------------------------------------------

SECTIONS = [
    {"id": "about",    "label": "About You",      "desc": "Basic info to get started"},
    {"id": "training", "label": "Your Training",   "desc": "How and when you train"},
    {"id": "body",     "label": "Your Body",       "desc": "Zones, paces, and history"},
    {"id": "connect",  "label": "Connect",         "desc": "Wearables and activity data"},
    {"id": "notes",    "label": "Anything else?",  "desc": "Anything your coach should know"},
]

STEPS = [
    # section,    step_id,           title
    ("about",    "name",            "What's your full name?"),
    ("about",    "race",            "What's your target race or event?"),
    ("about",    "race_date",       "When is the race?"),
    ("about",    "timezone",        "What timezone are you in?"),
    ("training", "disciplines",     "What do you train for?"),
    ("training", "weekly_hours",    "How many hours a week do you train?"),
    ("training", "train_time",      "What time of day do you usually train?"),
    ("training", "session_desc",    "Describe a typical training session."),
    ("body",     "hr_zone_system",  "What heart rate zone system do you use?"),
    ("body",     "swim_css",        "What's your swim CSS pace?"),
    ("body",     "injury_history",  "Any injury history or medical notes?"),
    ("connect",  "oura",            "Connect your Oura Ring"),
    ("connect",  "strava",          "Connect Strava"),
    ("notes",    "notes",           "Is there anything else you'd like to share?"),
]

TOTAL_STEPS = len(STEPS)


def _e(val: Any) -> str:
    return html.escape(str(val)) if val is not None else ""


# ---------------------------------------------------------------------------
# Supabase helpers
# ---------------------------------------------------------------------------

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
    result = query.execute()
    return result


# ---------------------------------------------------------------------------
# Token validation
# ---------------------------------------------------------------------------

async def _validate_invite_token(supabase: Any, token: str) -> dict | None:
    """Return the token row if it's valid (unused, not expired), else None."""
    rows = await _query_rows(
        supabase.table("athlete_connect_tokens")
        .select("*")
        .eq("token", token)
        .is_("used_at", "null")
        .gte("expires_at", "now()")
    )
    return rows[0] if rows else None


# ---------------------------------------------------------------------------
# Session helpers
# ---------------------------------------------------------------------------

async def _get_or_create_session(supabase: Any, token: str) -> dict:
    rows = await _query_rows(
        supabase.table("onboarding_sessions")
        .select("*")
        .eq("phone_number", f"web:{token}")
    )
    if rows:
        return rows[0]
    _sync_exec(
        supabase.table("onboarding_sessions").insert({
            "phone_number": f"web:{token}",
            "step": "name",
            "collected": {},
        })
    )
    rows = await _query_rows(
        supabase.table("onboarding_sessions")
        .select("*")
        .eq("phone_number", f"web:{token}")
    )
    return rows[0] if rows else {"phone_number": f"web:{token}", "step": "name", "collected": {}}


def _save_session(supabase: Any, token: str, step: str, collected: dict) -> None:
    _sync_exec(
        supabase.table("onboarding_sessions").update({
            "step": step,
            "collected": collected,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("phone_number", f"web:{token}")
    )


def _step_index(step_id: str) -> int:
    for i, (_, sid, _) in enumerate(STEPS):
        if sid == step_id:
            return i
    return 0


def _next_step(step_id: str) -> str | None:
    idx = _step_index(step_id)
    if idx + 1 < len(STEPS):
        return STEPS[idx + 1][1]
    return None


def _progress_pct(step_id: str) -> int:
    idx = _step_index(step_id)
    return int((idx / TOTAL_STEPS) * 100)


# ---------------------------------------------------------------------------
# HTML shell
# ---------------------------------------------------------------------------

def _shell(step_id: str, token: str, body: str) -> str:
    current_section = next((s for s, sid, _ in STEPS if sid == step_id), "about")
    progress = _progress_pct(step_id)
    step_idx = _step_index(step_id)

    # Left sidebar sections
    sidebar_items = []
    for i, sec in enumerate(SECTIONS):
        sec_steps = [sid for s, sid, _ in STEPS if s == sec["id"]]
        is_done = all(_step_index(s) < step_idx for s in sec_steps)
        is_active = current_section == sec["id"]
        if is_done:
            num_html = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="8" fill="#1a1a1a"/><path d="M5 8l2 2 4-4" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
            label_color = "#1a1a1a"
        elif is_active:
            num_html = f'<span style="width:24px;height:24px;border-radius:50%;background:#1a1a1a;color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;">{i+1}</span>'
            label_color = "#1a1a1a"
        else:
            num_html = f'<span style="width:24px;height:24px;border-radius:50%;border:1.5px solid #ccc;color:#999;display:flex;align-items:center;justify-content:center;font-size:12px;">{i+1}</span>'
            label_color = "#999"

        sidebar_items.append(f"""
        <div style="display:flex;gap:12px;align-items:flex-start;padding:12px 0;
             {'border-left:3px solid #1a1a1a;padding-left:12px;' if is_active else 'padding-left:15px;'}">
          <div style="flex-shrink:0;margin-top:2px;">{num_html}</div>
          <div>
            <div style="font-size:14px;font-weight:{'600' if is_active else '400'};color:{label_color};">{sec['label']}</div>
            <div style="font-size:12px;color:#9ca3af;margin-top:2px;">{sec['desc']}</div>
          </div>
        </div>
        """)

    sidebar = "".join(sidebar_items)

    back_step = STEPS[step_idx - 1][1] if step_idx > 0 else None
    if back_step:
        back_btn = f'<a href="/onboard?token={_e(token)}&step={back_step}" style="width:36px;height:36px;border-radius:50%;border:1.5px solid #d1d5db;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#1a1a1a;">&#8592;</a>'
    else:
        back_btn = '<div style="width:36px;"></div>'

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Get Started — Andes.IA</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #fff; color: #1a1a1a; line-height: 1.5; min-height: 100vh; }}

  /* Layout */
  .layout {{ display: flex; min-height: 100vh; }}
  .sidebar {{
    width: 320px; flex-shrink: 0;
    background: #f0ece4;
    padding: 40px 32px;
    display: flex; flex-direction: column;
  }}
  .sidebar-logo {{
    font-size: 20px; font-weight: 700; letter-spacing: -0.5px;
    margin-bottom: 48px; color: #1a1a1a;
  }}
  .sidebar-logo span {{ color: #6b7280; font-weight: 400; font-size: 13px; display: block; margin-top: 2px; }}
  .main {{
    flex: 1; display: flex; flex-direction: column;
  }}

  /* Top bar */
  .topbar {{
    display: flex; align-items: center; gap: 16px;
    padding: 20px 48px; border-bottom: 1px solid #f0f0f0;
  }}
  .progress-track {{
    flex: 1; height: 4px; background: #e5e7eb; border-radius: 2px; overflow: hidden;
  }}
  .progress-fill {{
    height: 100%; background: #1a1a1a; border-radius: 2px;
    transition: width 0.3s ease;
    width: {progress}%;
  }}
  .skip-btn {{
    font-size: 14px; color: #9ca3af; text-decoration: none;
    white-space: nowrap;
  }}
  .skip-btn:hover {{ color: #374151; }}

  /* Content */
  .content {{
    flex: 1; padding: 60px 48px 100px;
    max-width: 640px;
  }}
  .step-title {{
    font-size: 32px; font-weight: 700; line-height: 1.2;
    margin-bottom: 8px; letter-spacing: -0.5px;
  }}
  .step-subtitle {{
    font-size: 16px; color: #6b7280; margin-bottom: 40px; line-height: 1.5;
  }}

  /* Choice cards */
  .choices {{ display: flex; flex-direction: column; gap: 12px; max-width: 480px; }}
  .choice-card {{
    padding: 18px 20px; border: 1.5px solid #e5e7eb; border-radius: 12px;
    cursor: pointer; font-size: 15px; font-weight: 500; color: #1a1a1a;
    background: white; text-align: left; width: 100%;
    transition: border-color 0.15s, background 0.15s;
    display: flex; align-items: center; justify-content: space-between;
    position: relative;
  }}
  .choice-card:hover {{ border-color: #9ca3af; background: #fafafa; }}
  .choice-card.selected {{
    border-color: #1a1a1a; border-width: 2px;
    background: #fff;
  }}
  .choice-card.selected::after {{
    content: '';
    position: absolute; top: -1px; right: -1px;
    width: 24px; height: 24px; border-radius: 50%;
    background: #1a1a1a;
    background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M2.5 6l2.5 2.5 5-5' stroke='white' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
  }}
  .choice-desc {{ font-size: 13px; color: #6b7280; font-weight: 400; margin-top: 4px; }}

  /* Multi-select chips */
  .chips {{ display: flex; flex-wrap: wrap; gap: 10px; max-width: 480px; }}
  .chip {{
    padding: 12px 20px; border: 1.5px solid #e5e7eb; border-radius: 100px;
    cursor: pointer; font-size: 14px; font-weight: 500;
    background: white; color: #374151;
    transition: border-color 0.15s, background 0.15s;
  }}
  .chip:hover {{ border-color: #9ca3af; }}
  .chip.selected {{ border-color: #1a1a1a; border-width: 2px; background: #1a1a1a; color: white; }}

  /* Text inputs */
  .text-input {{
    width: 100%; max-width: 480px;
    padding: 14px 16px; border: 1.5px solid #e5e7eb; border-radius: 12px;
    font-size: 15px; font-family: inherit; color: #1a1a1a;
    outline: none; transition: border-color 0.15s;
  }}
  .text-input:focus {{ border-color: #1a1a1a; }}
  .text-input::placeholder {{ color: #9ca3af; }}
  textarea.text-input {{ min-height: 140px; resize: vertical; line-height: 1.6; }}

  /* Bottom bar */
  .bottom-bar {{
    position: fixed; bottom: 0; left: 320px; right: 0;
    padding: 20px 48px;
    background: white; border-top: 1px solid #f0f0f0;
    display: flex; justify-content: flex-end;
  }}
  .continue-btn {{
    padding: 14px 36px; background: #1a1a1a; color: white;
    border: none; border-radius: 100px; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: opacity 0.15s;
  }}
  .continue-btn:hover {{ opacity: 0.85; }}
  .continue-btn:disabled {{ opacity: 0.4; cursor: not-allowed; }}

  /* Connect step */
  .connect-card {{
    border: 1.5px solid #e5e7eb; border-radius: 12px; padding: 24px;
    max-width: 480px; display: flex; align-items: center; gap: 16px;
    margin-bottom: 16px;
  }}
  .connect-icon {{ font-size: 28px; width: 48px; text-align: center; }}
  .connect-label {{ font-size: 15px; font-weight: 600; }}
  .connect-sub {{ font-size: 13px; color: #6b7280; margin-top: 2px; }}
  .connect-btn {{
    margin-left: auto; padding: 10px 20px; border-radius: 100px;
    font-size: 14px; font-weight: 600; border: none; cursor: pointer;
    text-decoration: none; display: inline-block;
  }}
  .connect-btn-primary {{ background: #1a1a1a; color: white; }}
  .connect-btn-connected {{ background: #dcfce7; color: #166534; cursor: default; }}
  .oura-input-wrap {{ margin-top: 16px; max-width: 480px; }}
  .oura-hint {{ font-size: 13px; color: #6b7280; margin-top: 8px; }}

  /* Mobile */
  @media (max-width: 768px) {{
    .sidebar {{ display: none; }}
    .content {{ padding: 32px 24px 100px; }}
    .topbar {{ padding: 16px 24px; }}
    .bottom-bar {{ left: 0; padding: 16px 24px; }}
    .step-title {{ font-size: 24px; }}
  }}
</style>
</head>
<body>
<div class="layout">
  <!-- Sidebar -->
  <aside class="sidebar">
    <div class="sidebar-logo">Andes.IA<span>Live optimized.</span></div>
    {sidebar}
  </aside>

  <!-- Main -->
  <div class="main">
    <!-- Top bar -->
    <div class="topbar">
      {back_btn}
      <div class="progress-track"><div class="progress-fill"></div></div>
      <a href="/onboard/skip?token={_e(token)}&step={_e(step_id)}" class="skip-btn">Skip</a>
    </div>

    <!-- Content -->
    <div class="content">
      {body}
    </div>

    <!-- Bottom bar spacer handled by fixed positioning -->
  </div>
</div>
</body>
</html>"""


# ---------------------------------------------------------------------------
# Individual step renderers
# ---------------------------------------------------------------------------

def _render_name(token: str, collected: dict) -> str:
    val = _e(collected.get("name", ""))
    return f"""
<h1 class="step-title">What's your full name?</h1>
<form method="post" action="/onboard/save?token={_e(token)}&step=name">
  <input class="text-input" type="text" name="value" placeholder="e.g. Felipe Deidan"
         value="{val}" autocomplete="name" autofocus required>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_race(token: str, collected: dict) -> str:
    val = _e(collected.get("race", ""))
    return f"""
<h1 class="step-title">What's your target race or event?</h1>
<p class="step-subtitle">Include the distance and name if you know it.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=race">
  <input class="text-input" type="text" name="value"
         placeholder="e.g. Ironman 70.3 Eagleman, Boston Marathon"
         value="{val}" autofocus>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_race_date(token: str, collected: dict) -> str:
    val = _e(collected.get("race_date", ""))
    return f"""
<h1 class="step-title">When is the race?</h1>
<form method="post" action="/onboard/save?token={_e(token)}&step=race_date">
  <input class="text-input" type="text" name="value"
         placeholder="e.g. June 15 2026"
         value="{val}" autofocus>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_timezone(token: str, collected: dict) -> str:
    val = collected.get("timezone", "")
    timezones = [
        "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
        "America/Sao_Paulo", "America/Toronto", "America/Vancouver",
        "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Madrid",
        "Australia/Sydney", "Asia/Tokyo", "Asia/Dubai",
    ]
    options = "".join(
        f'<option value="{tz}" {"selected" if tz == val else ""}>{tz.replace("_", " ")}</option>'
        for tz in timezones
    )
    return f"""
<h1 class="step-title">What timezone are you in?</h1>
<form method="post" action="/onboard/save?token={_e(token)}&step=timezone">
  <select class="text-input" name="value" autofocus>
    <option value="">— Select timezone —</option>
    {options}
  </select>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_disciplines(token: str, collected: dict) -> str:
    selected = collected.get("disciplines") or []
    if isinstance(selected, str):
        selected = [selected]
    opts = [
        ("🏊 Swim",     "swim"),
        ("🚴 Bike",     "bike"),
        ("🏃 Run",      "run"),
        ("🏋️ Strength", "strength"),
        ("🤸 Multi-sport / Triathlon", "triathlon"),
    ]
    cards = ""
    for label, val in opts:
        sel = "selected" if val in selected else ""
        cards += f"""<button type="button" class="chip {sel}"
          onclick="toggleChip(this, '{val}')">{label}</button>"""
    return f"""
<h1 class="step-title">What do you train for?</h1>
<p class="step-subtitle">Select all that apply.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=disciplines">
  <input type="hidden" name="value" id="disciplines-val" value="{_e(','.join(selected))}">
  <div class="chips">{cards}</div>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>
<script>
function toggleChip(el, val) {{
  el.classList.toggle('selected');
  const input = document.getElementById('disciplines-val');
  let vals = input.value ? input.value.split(',') : [];
  if (el.classList.contains('selected')) {{
    if (!vals.includes(val)) vals.push(val);
  }} else {{
    vals = vals.filter(v => v !== val);
  }}
  input.value = vals.join(',');
}}
</script>"""


def _render_weekly_hours(token: str, collected: dict) -> str:
    val = collected.get("weekly_hours", "")
    opts = [
        ("<5 hours",    "lt5"),
        ("5–8 hours",   "5-8"),
        ("8–12 hours",  "8-12"),
        ("12–16 hours", "12-16"),
        ("16–20 hours", "16-20"),
        ("20+ hours",   "gt20"),
    ]
    cards = ""
    for label, v in opts:
        sel = "selected" if v == val else ""
        cards += f"""<button type="button" class="choice-card {sel}"
          onclick="selectChoice(this, '{_e(v)}')">{label}</button>"""
    return f"""
<h1 class="step-title">How many hours a week do you train?</h1>
<form method="post" action="/onboard/save?token={_e(token)}&step=weekly_hours">
  <input type="hidden" name="value" id="weekly-val" value="{_e(str(val))}">
  <div class="choices">{cards}</div>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>
<script>
function selectChoice(el, val) {{
  document.querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('weekly-val').value = val;
}}
</script>"""


def _render_train_time(token: str, collected: dict) -> str:
    val = collected.get("train_time", "")
    opts = ["Morning", "Midday", "Evening", "Varies"]
    cards = ""
    for v in opts:
        sel = "selected" if v.lower() == val.lower() else ""
        cards += f"""<button type="button" class="choice-card {sel}"
          onclick="selectChoice(this, '{v}')">{v}</button>"""
    return f"""
<h1 class="step-title">What time of day do you usually train?</h1>
<form method="post" action="/onboard/save?token={_e(token)}&step=train_time">
  <input type="hidden" name="value" id="train-time-val" value="{_e(val)}">
  <div class="choices">{cards}</div>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>
<script>
function selectChoice(el, val) {{
  document.querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('train-time-val').value = val;
}}
</script>"""


def _render_session_desc(token: str, collected: dict) -> str:
    val = _e(collected.get("session_desc", ""))
    return f"""
<h1 class="step-title">Describe a typical training session.</h1>
<p class="step-subtitle">Include what you're training for and how your sessions are usually structured
(e.g. duration, type of work, intensity, frequency).</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=session_desc">
  <textarea class="text-input" name="value" autofocus
    placeholder="e.g. I'm training for a 70.3. A typical week includes a long ride on Saturday (3–4h), intervals on Tuesday, and a long run on Sunday. I train 10–12 hours/week.">{val}</textarea>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_hr_zone_system(token: str, collected: dict) -> str:
    val = collected.get("hr_zone_system", "")
    opts = [
        ("Use coach's standard zones",           "coach_standard",
         "Your coach's methodology will define your zones."),
        ("5-zone system (easy/aerobic/tempo/threshold/max)", "5zone",
         "Common in running and cycling."),
        ("7-zone system (Friel / TrainingPeaks)", "7zone",
         "Used by coaches following Joe Friel methodology."),
        ("I'll provide my own zones",            "custom",
         "Enter your HR values manually."),
    ]
    cards = ""
    for label, v, desc in opts:
        sel = "selected" if v == val else ""
        cards += f"""<button type="button" class="choice-card {sel}"
          onclick="selectChoice(this, '{v}')">
          <div>
            <div>{label}</div>
            <div class="choice-desc">{desc}</div>
          </div>
        </button>"""
    return f"""
<h1 class="step-title">What heart rate zone system do you use?</h1>
<form method="post" action="/onboard/save?token={_e(token)}&step=hr_zone_system">
  <input type="hidden" name="value" id="hr-zone-val" value="{_e(val)}">
  <div class="choices">{cards}</div>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>
<script>
function selectChoice(el, val) {{
  document.querySelectorAll('.choice-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('hr-zone-val').value = val;
}}
</script>"""


def _render_swim_css(token: str, collected: dict) -> str:
    val = _e(collected.get("swim_css", ""))
    return f"""
<h1 class="step-title">What's your swim CSS pace?</h1>
<p class="step-subtitle">CSS (Critical Swim Speed) is your threshold pace per 100m.
If you don't know it yet, you can skip and add it later.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=swim_css">
  <input class="text-input" type="text" name="value"
         placeholder="e.g. 1:45 /100m"
         value="{val}" autofocus>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_injury_history(token: str, collected: dict) -> str:
    val = _e(collected.get("injury_history", ""))
    return f"""
<h1 class="step-title">Any injury history or medical notes?</h1>
<p class="step-subtitle">Your coach uses this to make safer, smarter recommendations.
Include anything relevant — past injuries, recurring issues, medical conditions.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=injury_history">
  <textarea class="text-input" name="value" autofocus
    placeholder="e.g. Left knee patella tendinopathy (resolved 2024). No current issues.">{val}</textarea>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_oura(token: str, collected: dict, athlete_id: str | None = None) -> str:
    has_oura = bool(collected.get("oura_token"))
    if has_oura:
        connect_section = """
<div class="connect-card">
  <div class="connect-icon">💍</div>
  <div>
    <div class="connect-label">Oura Ring</div>
    <div class="connect-sub">Connected ✓</div>
  </div>
  <span class="connect-btn connect-btn-connected">Connected</span>
</div>"""
    else:
        connect_section = """
<div class="connect-card">
  <div class="connect-icon">💍</div>
  <div>
    <div class="connect-label">Oura Ring</div>
    <div class="connect-sub">Paste your Personal Access Token below</div>
  </div>
</div>
<div class="oura-input-wrap">
  <input class="text-input" type="text" name="oura_token" id="oura-token-input"
         placeholder="Paste your Oura PAT here">
  <p class="oura-hint">
    Get your token at
    <a href="https://cloud.ouraring.com/personal-access-tokens" target="_blank"
       style="color:#1a1a1a;">cloud.ouraring.com/personal-access-tokens</a>
  </p>
</div>"""

    return f"""
<h1 class="step-title">Connect your Oura Ring</h1>
<p class="step-subtitle">Your readiness, HRV, and sleep scores will be used to personalize your check-ins and coaching.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=oura">
  {connect_section}
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">{'Continue' if has_oura else 'Save & Continue'}</button>
  </div>
</form>"""


def _render_strava(token: str, collected: dict, athlete_id: str | None = None) -> str:
    has_strava = bool(collected.get("strava_connected"))

    # Check if Strava is configured on the backend
    from app.core.config import get_settings as _get_settings
    _settings = _get_settings()
    strava_configured = bool(getattr(_settings, "strava_client_id", None))

    if has_strava:
        strava_block = """
<div class="connect-card">
  <div class="connect-icon">🚴</div>
  <div>
    <div class="connect-label">Strava</div>
    <div class="connect-sub">Connected ✓</div>
  </div>
  <span class="connect-btn connect-btn-connected">Connected</span>
</div>"""
    elif strava_configured:
        if athlete_id:
            strava_href = f"/onboard/strava_oauth?token={_e(token)}&athlete_id={_e(athlete_id)}"
        else:
            strava_href = f"/onboard/strava_oauth?token={_e(token)}"
        strava_block = f"""
<div class="connect-card">
  <div class="connect-icon">🚴</div>
  <div>
    <div class="connect-label">Strava</div>
    <div class="connect-sub">Sync your activities for smarter coaching</div>
  </div>
  <a href="{strava_href}" class="connect-btn connect-btn-primary">Connect</a>
</div>"""
    else:
        # Strava not yet configured — show a friendly skip card
        strava_block = """
<div class="connect-card" style="opacity:0.6;">
  <div class="connect-icon">🚴</div>
  <div>
    <div class="connect-label">Strava</div>
    <div class="connect-sub">Your coach will send you a Strava connect link separately.</div>
  </div>
</div>
<p style="font-size:13px;color:#9ca3af;margin-top:12px;">
  You can connect Strava later — just hit Continue for now.
</p>"""

    return f"""
<h1 class="step-title">Connect Strava</h1>
<p class="step-subtitle">Your workout data helps your coach see what you've actually done — not just what you planned.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=strava">
  {strava_block}
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Continue</button>
  </div>
</form>"""


def _render_notes(token: str, collected: dict) -> str:
    val = _e(collected.get("notes", ""))
    return f"""
<h1 class="step-title">Is there anything else you'd like to share?</h1>
<p class="step-subtitle">Your coach uses everything you share to personalize your experience.
Training history, goals, concerns — anything goes.</p>
<form method="post" action="/onboard/save?token={_e(token)}&step=notes">
  <textarea class="text-input" name="value" autofocus
    placeholder="e.g. I've been training for 2 years. I want to break 5 hours at Eagleman. I tend to struggle on the run in heat.">{val}</textarea>
  <div class="bottom-bar">
    <button class="continue-btn" type="submit">Finish &rarr;</button>
  </div>
</form>"""


STEP_RENDERERS = {
    "name":           _render_name,
    "race":           _render_race,
    "race_date":      _render_race_date,
    "timezone":       _render_timezone,
    "disciplines":    _render_disciplines,
    "weekly_hours":   _render_weekly_hours,
    "train_time":     _render_train_time,
    "session_desc":   _render_session_desc,
    "hr_zone_system": _render_hr_zone_system,
    "swim_css":       _render_swim_css,
    "injury_history": _render_injury_history,
    "oura":           _render_oura,
    "strava":         _render_strava,
    "notes":          _render_notes,
}


# ---------------------------------------------------------------------------
# Error / done pages
# ---------------------------------------------------------------------------

def _error_page(msg: str) -> HTMLResponse:
    return HTMLResponse(f"""<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:-apple-system,sans-serif;text-align:center;padding:80px 24px;color:#1a1a1a}}
.icon{{font-size:48px;margin-bottom:16px}}.title{{font-size:22px;font-weight:700;margin-bottom:8px}}
.sub{{color:#666;font-size:15px}}</style></head><body>
<div class="icon">❌</div>
<div class="title">{_e(msg)}</div>
<div class="sub">Ask your coach to resend the onboarding link.</div>
</body></html>""", status_code=410)


def _done_page(name: str, coach_whatsapp: str | None = None) -> HTMLResponse:
    # Build the WhatsApp CTA block if we have the coach's number
    if coach_whatsapp:
        # Normalise to digits only for wa.me link
        wa_digits = "".join(c for c in coach_whatsapp if c.isdigit())
        wa_block = f"""<div style="margin-top:32px">
<a href="https://wa.me/{_e(wa_digits)}"
   style="display:inline-block;background:#25D366;color:#fff;font-weight:700;
          font-size:17px;padding:16px 32px;border-radius:14px;text-decoration:none;
          box-shadow:0 4px 16px rgba(37,211,102,0.3)">
  💬 Message your coach on WhatsApp
</a>
<p style="margin-top:12px;font-size:13px;color:#999">
  Tap to open WhatsApp and send your first check-in.
</p>
</div>"""
    else:
        wa_block = """<div style="margin-top:28px;font-size:15px;color:#666">
Your coach will send you a WhatsApp message to get started.<br>
Make sure to save their number when they reach out!
</div>"""

    return HTMLResponse(f"""<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{{font-family:-apple-system,sans-serif;text-align:center;padding:80px 24px;color:#1a1a1a;max-width:480px;margin:0 auto}}
.icon{{font-size:56px;margin-bottom:24px}}.title{{font-size:28px;font-weight:700;margin-bottom:12px;letter-spacing:-0.5px}}
.sub{{color:#666;font-size:16px;line-height:1.6}}</style></head><body>
<div class="icon">✅</div>
<div class="title">You're all set, {_e(name)}!</div>
<div class="sub">Your coach has been notified and will be in touch soon.</div>
{wa_block}
</body></html>""")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_class=HTMLResponse)
async def onboard_get(request: Request, token: str = Query(...), step: str | None = Query(default=None)):
    """Render the current onboarding step."""
    supabase = request.app.state.supabase_client

    token_row = await _validate_invite_token(supabase, token)
    if not token_row:
        return _error_page("This onboarding link has expired or already been used.")

    session = await _get_or_create_session(supabase, token)
    collected = session.get("collected") or {}

    # Determine which step to show
    current_step = step or session.get("step") or "name"
    if current_step not in STEP_RENDERERS:
        current_step = "name"

    renderer = STEP_RENDERERS[current_step]
    athlete_id = token_row.get("athlete_id")

    if current_step in ("oura", "strava"):
        body = renderer(token, collected, athlete_id)
    else:
        body = renderer(token, collected)

    return HTMLResponse(_shell(current_step, token, body))


@router.post("/save", response_class=HTMLResponse)
async def onboard_save(
    request: Request,
    token: str = Query(...),
    step: str = Query(...),
    value: str | None = Form(default=None),
    oura_token: str | None = Form(default=None),
):
    """Save a step's answer and advance."""
    supabase = request.app.state.supabase_client

    token_row = await _validate_invite_token(supabase, token)
    if not token_row:
        return _error_page("This onboarding link has expired or already been used.")

    session = await _get_or_create_session(supabase, token)
    collected: dict = dict(session.get("collected") or {})

    # Map step → collected field
    field_map = {
        "name":           "name",
        "race":           "race",
        "race_date":      "race_date",
        "timezone":       "timezone",
        "disciplines":    "disciplines",
        "weekly_hours":   "weekly_hours",
        "train_time":     "train_time",
        "session_desc":   "session_desc",
        "hr_zone_system": "hr_zone_system",
        "swim_css":       "swim_css",
        "injury_history": "injury_history",
        "notes":          "notes",
    }

    if step == "oura":
        if oura_token and oura_token.strip():
            collected["oura_token"] = oura_token.strip()
    elif step in field_map and value is not None:
        v = value.strip()
        if v:
            collected[field_map[step]] = v

    next_step = _next_step(step)

    if next_step is None:
        # Final step — complete onboarding
        _save_session(supabase, token, "complete", collected)
        coach_wa = await _finalize_onboarding(request, supabase, token_row, collected)
        name = collected.get("name", "there")
        return _done_page(name, coach_whatsapp=coach_wa)

    _save_session(supabase, token, next_step, collected)
    return RedirectResponse(f"/onboard?token={token}&step={next_step}", status_code=303)


@router.get("/skip", response_class=HTMLResponse)
async def onboard_skip(
    request: Request,
    token: str = Query(...),
    step: str = Query(...),
):
    """Skip the current step and advance."""
    supabase = request.app.state.supabase_client

    token_row = await _validate_invite_token(supabase, token)
    if not token_row:
        return _error_page("This onboarding link has expired or already been used.")

    session = await _get_or_create_session(supabase, token)
    collected = session.get("collected") or {}
    next_step = _next_step(step)

    if next_step is None:
        _save_session(supabase, token, "complete", collected)
        coach_wa = await _finalize_onboarding(request, supabase, token_row, collected)
        name = collected.get("name", "there")
        return _done_page(name, coach_whatsapp=coach_wa)

    _save_session(supabase, token, next_step, collected)
    return RedirectResponse(f"/onboard?token={token}&step={next_step}", status_code=303)


@router.get("/strava_oauth")
async def onboard_strava_oauth(
    request: Request,
    token: str = Query(...),
    athlete_id: str | None = Query(default=None),
):
    """Redirect to Strava OAuth, passing onboarding token as state."""
    supabase = request.app.state.supabase_client

    token_row = await _validate_invite_token(supabase, token)
    if not token_row:
        return _error_page("This onboarding link has expired or already been used.")

    settings = get_settings()
    if not getattr(settings, "strava_client_id", None):
        # Strava not configured — send athlete back to the step showing a skip option
        return RedirectResponse(f"/onboard?token={token}&step=strava", status_code=303)

    from urllib.parse import urlencode
    base_url = "https://coach-ai-production-a5aa.up.railway.app"
    state_val = f"onboard:{token}:{athlete_id or ''}"
    params = {
        "client_id": settings.strava_client_id,
        "redirect_uri": f"{base_url}/onboard/strava_callback",
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "activity:read_all",
        "state": state_val,
    }
    return RedirectResponse(f"https://www.strava.com/oauth/authorize?{urlencode(params)}")


@router.get("/strava_callback", response_class=HTMLResponse)
async def onboard_strava_callback(
    request: Request,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
):
    """Handle Strava OAuth callback during onboarding."""
    if error or not code or not state:
        return _error_page("Strava authorization was cancelled.")

    parts = state.split(":")
    if len(parts) < 2 or parts[0] != "onboard":
        return _error_page("Invalid callback state.")

    token = parts[1]
    athlete_id = parts[2] if len(parts) > 2 and parts[2] else None

    supabase = request.app.state.supabase_client
    settings = get_settings()

    import httpx
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://www.strava.com/api/v3/oauth/token",
                data={
                    "client_id": settings.strava_client_id,
                    "client_secret": settings.strava_client_secret,
                    "code": code,
                    "grant_type": "authorization_code",
                },
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        logger.error("[onboard] Strava token exchange failed: %s", exc)
        return _error_page("Failed to connect Strava. Please try again.")

    if athlete_id:
        strava_athlete_id = data.get("athlete", {}).get("id")
        _sync_exec(supabase.table("strava_tokens").upsert({
            "athlete_id": athlete_id,
            "strava_athlete_id": strava_athlete_id,
            "access_token": data["access_token"],
            "refresh_token": data["refresh_token"],
            "expires_at": data["expires_at"],
        }, on_conflict="athlete_id"))

    # Mark strava connected in session
    session = await _get_or_create_session(supabase, token)
    collected = dict(session.get("collected") or {})
    collected["strava_connected"] = True
    _save_session(supabase, token, "strava", collected)

    # Redirect back to strava step (will show connected state)
    return RedirectResponse(f"/onboard?token={token}&step=strava", status_code=303)


# ---------------------------------------------------------------------------
# Finalization — creates athlete row + notifies coach
# ---------------------------------------------------------------------------

async def _finalize_onboarding(
    request: Request,
    supabase: Any,
    token_row: dict,
    collected: dict,
) -> str | None:
    """Finalize athlete onboarding. Returns the coach's WhatsApp number (if known) so
    the done page can show a tap-to-open WhatsApp link."""
    """Create athlete row, store tokens, notify coach. Mirrors WhatsApp _complete_onboarding."""
    import inspect as _inspect

    async def _qr(query: Any) -> list[dict]:
        if hasattr(query, "execute"):
            result = query.execute()
            resp = await result if _inspect.isawaitable(result) else result
        else:
            resp = await query if _inspect.isawaitable(query) else query
        data = getattr(resp, "data", resp)
        if isinstance(data, list):
            return [r for r in data if isinstance(r, dict)]
        if isinstance(data, dict):
            return [data]
        return []

    # Resolve coach — prefer from invite token, fall back to settings
    coach_id = token_row.get("coach_id")
    coach_whatsapp = token_row.get("coach_whatsapp_number")
    organization_id = token_row.get("organization_id", "1")

    settings = get_settings()

    # Always look up the coach row when we have a coach_id so we get the
    # latest whatsapp_number. If no coach_id on the token, find the first coach.
    try:
        if coach_id:
            coach_rows = await _qr(supabase.table("coaches").select("id, whatsapp_number").eq("id", coach_id).limit(1))
        else:
            coach_rows = await _qr(supabase.table("coaches").select("id, whatsapp_number").limit(1))
        if coach_rows:
            if not coach_id:
                coach_id = coach_rows[0].get("id")
            # whatsapp_number takes priority over anything on the token
            db_whatsapp = coach_rows[0].get("whatsapp_number")
            if db_whatsapp:
                coach_whatsapp = db_whatsapp
    except Exception as exc:
        logger.warning("[onboard] Could not fetch coach whatsapp: %s", exc)

    if not coach_id:
        coach_id = getattr(settings, "coach_id", None)
    if not coach_whatsapp:
        coach_whatsapp = getattr(settings, "coach_whatsapp_number", None)
    # Never fall back to the coach's personal phone_number — that's not the
    # WhatsApp Business number athletes should be texting.

    # Build stable_profile
    stable_profile: dict[str, Any] = {}
    if collected.get("race"):
        stable_profile["target_race"] = collected["race"]
    if collected.get("race_date"):
        stable_profile["race_date"] = collected["race_date"]
    if collected.get("swim_css"):
        stable_profile["swim_css"] = collected["swim_css"]
    if collected.get("injury_history"):
        stable_profile["injury_history"] = collected["injury_history"]
    if collected.get("notes"):
        stable_profile["notes"] = collected["notes"]
    if collected.get("disciplines"):
        stable_profile["disciplines"] = collected["disciplines"]
    if collected.get("session_desc"):
        stable_profile["session_desc"] = collected["session_desc"]
    if collected.get("weekly_hours"):
        stable_profile["max_weekly_hours"] = collected["weekly_hours"]
    if collected.get("hr_zone_system"):
        stable_profile["hr_zone_system"] = collected["hr_zone_system"]
    if collected.get("train_time"):
        stable_profile["train_time"] = collected["train_time"]

    name = collected.get("name", "New Athlete")

    # Check if athlete row was already created (e.g., from WhatsApp onboarding earlier)
    existing_athlete_id = token_row.get("athlete_id")
    athlete_id = existing_athlete_id

    if existing_athlete_id:
        # Update existing athlete's stable_profile
        _sync_exec(
            supabase.table("athletes").update({
                "full_name": name,
                "stable_profile": stable_profile,
                "timezone_name": collected.get("timezone") or "UTC",
            }).eq("id", existing_athlete_id)
        )
        logger.info("[onboard] Updated athlete %s from web onboarding", existing_athlete_id)
    else:
        # No pre-existing athlete — need a phone placeholder
        result = _sync_exec(supabase.table("athletes").insert({
            "full_name": name,
            "phone_number": f"web:{token_row['token']}",
            "coach_id": coach_id,
            "organization_id": organization_id,
            "timezone_name": collected.get("timezone") or "UTC",
            "stable_profile": stable_profile,
            "current_state": {},
        }))
        if result and hasattr(result, "data") and result.data:
            athlete_id = result.data[0].get("id")
        logger.info("[onboard] Created new athlete %s from web onboarding", athlete_id)

    if not athlete_id:
        logger.error("[onboard] Could not resolve athlete_id — aborting finalization")
        return

    # Store Oura token
    if collected.get("oura_token"):
        _sync_exec(supabase.table("oura_tokens").upsert({
            "athlete_id": athlete_id,
            "access_token": collected["oura_token"],
        }, on_conflict="athlete_id"))
        logger.info("[onboard] Stored Oura token for %s", athlete_id)

    # Mark invite token as used
    _sync_exec(
        supabase.table("athlete_connect_tokens").update({
            "used_at": datetime.now(timezone.utc).isoformat(),
        }).eq("token", token_row["token"])
    )

    # Clean up onboarding session
    _sync_exec(
        supabase.table("onboarding_sessions").delete()
        .eq("phone_number", f"web:{token_row['token']}")
    )

    # Generate plan_access token so athlete can view /my-plan
    base_url = "https://coach-ai-production-a5aa.up.railway.app"
    plan_token = secrets.token_urlsafe(32)
    try:
        _sync_exec(supabase.table("athlete_connect_tokens").insert({
            "athlete_id": athlete_id,
            "token": plan_token,
            "purpose": "plan_access",
            "expires_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        }))
        logger.info("[onboard] Created plan_access token for athlete %s", athlete_id)
    except Exception as exc:
        logger.warning("[onboard] Could not create plan_access token: %s", exc)
        plan_token = None

    # Send plan link to athlete via WhatsApp (only if they have a real phone number)
    if plan_token and athlete_id:
        whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
        if whatsapp_client:
            try:
                athlete_phone_rows = await _qr(
                    supabase.table("athletes").select("phone_number").eq("id", athlete_id)
                )
                phone = athlete_phone_rows[0].get("phone_number", "") if athlete_phone_rows else ""
                if phone and not phone.startswith("web:"):
                    await whatsapp_client.send_message(
                        to=phone,
                        body=(
                            f"📋 Your training plan is ready! View it anytime here:\n"
                            f"{base_url}/my-plan?token={plan_token}\n\n"
                            "Bookmark this link — it's your personal plan page."
                        ),
                    )
                    logger.info("[onboard] Sent plan link to athlete %s", athlete_id)
            except Exception as exc:
                logger.warning("[onboard] Could not send plan link: %s", exc)

    # Notify coach via WhatsApp
    if coach_whatsapp:
        whatsapp_client = getattr(request.app.state, "whatsapp_client", None)
        if whatsapp_client:
            try:
                await whatsapp_client.send_message(
                    to=coach_whatsapp,
                    body=(
                        f"🆕 New athlete onboarded via web: {name}\n"
                        f"Race: {collected.get('race', '—')} on {collected.get('race_date', '—')}\n"
                        f"Oura: {'✅' if collected.get('oura_token') else '—'}  "
                        f"Strava: {'✅' if collected.get('strava_connected') else '—'}\n"
                        "Check the dashboard to review their profile."
                    ),
                )
            except Exception as exc:
                logger.warning("[onboard] Could not notify coach: %s", exc)

    logger.info("[onboard] Web onboarding complete for athlete %s (%s)", athlete_id, name)
    return coach_whatsapp  # Passed back so done page can show tap-to-open link
