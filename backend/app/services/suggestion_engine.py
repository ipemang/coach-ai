"""COA-64: AI Reasoning Engine — message classification, context assembly,
dual-output generation (message draft + plan modification proposal), and
coach decision logging.

Architecture:
  1. classify_message()        → MessageClass (check_in | plan_question | flag | noise)
  2. build_athlete_context()   → AthleteContext (plan + biometrics + history + methodology)
  3. generate_suggestion()     → SuggestionOutput (message draft + optional plan mod)
  4. log_coach_decision()      → inserts into coach_decisions table

The Interaction Agent wraps every message draft in the coach's persona before
delivery. Execution agents (ClassifierAgent, ReasoningAgent) have zero persona
— pure functional processors.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from app.services.llm_client import LLMClient, LLMResponse
from app.services.usage_logger import UsageLogger

logger = logging.getLogger(__name__)

# ── Message classification ─────────────────────────────────────────────────────

MessageClass = Literal["check_in", "plan_question", "flag", "noise"]

_CLASSIFIER_SYSTEM = """You are a message classifier for an endurance sports coaching platform.

Classify the athlete's message into exactly one of these categories:
- check_in: athlete reporting how they feel, training update, soreness, energy, sleep, workout completion
- plan_question: asking about a specific workout, requesting changes to the plan, timing questions
- flag: injury, illness, significant life stress, race day concern, emergency
- noise: thanks, emoji-only, scheduling admin, positive acknowledgement with no training content

Reply with a single JSON object — nothing else:
{"class": "<one of the four categories>", "confidence": <0.0-1.0>, "reason": "<one sentence>"}"""


@dataclass(slots=True)
class ClassificationResult:
    message_class: MessageClass
    confidence: float
    reason: str
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0


def classify_message(
    message_text: str,
    *,
    llm: LLMClient | None = None,
) -> ClassificationResult:
    """Classify an incoming athlete WhatsApp message.

    Fast, cheap call — uses a small model config. Falls back to 'check_in'
    if classification fails so the pipeline never hard-blocks.
    """
    client = llm or LLMClient()
    try:
        response = client.chat_completions(
            system=_CLASSIFIER_SYSTEM,
            user=f"Athlete message: {message_text.strip()[:2000]}",
        )
        data = _parse_json_safe(response.content)
        msg_class = data.get("class", "check_in")
        if msg_class not in ("check_in", "plan_question", "flag", "noise"):
            msg_class = "check_in"
        return ClassificationResult(
            message_class=msg_class,
            confidence=float(data.get("confidence", 0.7)),
            reason=str(data.get("reason", "")),
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
        )
    except Exception:
        logger.warning("[classifier] Classification failed, defaulting to check_in", exc_info=True)
        return ClassificationResult(
            message_class="check_in",
            confidence=0.5,
            reason="Classification failed — defaulted to check_in",
        )


# ── Athlete context assembly ───────────────────────────────────────────────────

@dataclass
class AthleteContext:
    athlete_id: str
    athlete_name: str
    coach_persona: str                   # coaches.persona_system_prompt
    methodology_summary: str             # coaches.methodology_playbook summary
    current_state: dict[str, Any]        # athletes.current_state (biometrics)
    upcoming_workouts: list[dict]        # next 7 days from workouts table
    recent_memory: str                   # last 5 memory_states as text summary
    few_shot_examples: list[dict]        # up to 5 past coach_decisions for this coach
    sport_specialties: list[str] = field(default_factory=list)
    athlete_goals: str = ""


def build_athlete_context(
    *,
    supabase: Any,
    coach_id: str,
    athlete_id: str,
) -> AthleteContext:
    """Fetch all context needed to generate a suggestion for this athlete.

    Pulls from: athletes, coaches, workouts, memory_states, coach_decisions.
    All queries are synchronous (supabase-py sync client).
    """
    # ── Athlete row ────────────────────────────────────────────────────────────
    try:
        athlete_row = supabase.table("athletes").select(
            "full_name, current_state, goals, sport"
        ).eq("id", athlete_id).single().execute()
        athlete = athlete_row.data or {}
    except Exception:
        logger.warning("[context] Could not fetch athlete %s", athlete_id)
        athlete = {}

    athlete_name = str(athlete.get("full_name") or "Athlete")
    current_state = athlete.get("current_state") or {}
    goals = str(athlete.get("goals") or "")

    # ── Coach row ──────────────────────────────────────────────────────────────
    try:
        coach_row = supabase.table("coaches").select(
            "persona_system_prompt, methodology_playbook"
        ).eq("id", coach_id).single().execute()
        coach = coach_row.data or {}
    except Exception:
        logger.warning("[context] Could not fetch coach %s", coach_id)
        coach = {}

    persona = str(coach.get("persona_system_prompt") or "You are a professional endurance sports coach. Be warm, direct, and evidence-based.")
    methodology_playbook = coach.get("methodology_playbook") or {}
    methodology_summary = _summarise_methodology(methodology_playbook)
    sport_specialties = methodology_playbook.get("sport_specialties") or []

    # ── Upcoming workouts (next 7 days) ────────────────────────────────────────
    try:
        today = datetime.now(timezone.utc).date().isoformat()
        workouts_row = supabase.table("workouts").select(
            "id, workout_type, scheduled_date, duration_minutes, description, tss_planned"
        ).eq("athlete_id", athlete_id).gte("scheduled_date", today).order(
            "scheduled_date"
        ).limit(7).execute()
        upcoming = workouts_row.data or []
    except Exception:
        logger.warning("[context] Could not fetch workouts for athlete %s", athlete_id)
        upcoming = []

    # ── Recent memory states (last 5) ──────────────────────────────────────────
    try:
        memory_row = supabase.table("memory_states").select(
            "state_type, summary, created_at, data"
        ).eq("athlete_id", athlete_id).order(
            "created_at", desc=True
        ).limit(5).execute()
        memory_states = memory_row.data or []
        recent_memory = _format_memory_states(memory_states)
    except Exception:
        logger.warning("[context] Could not fetch memory states for athlete %s", athlete_id)
        recent_memory = "No recent history available."

    # ── Few-shot examples (last 5 approved/modified decisions for this coach) ──
    try:
        decisions_row = supabase.table("coach_decisions").select(
            "decision_type, action, original_ai_output, final_output, created_at"
        ).eq("coach_id", coach_id).in_(
            "action", ["approved", "modified"]
        ).order("created_at", desc=True).limit(5).execute()
        few_shot = decisions_row.data or []
    except Exception:
        logger.warning("[context] Could not fetch coach decisions for coach %s", coach_id)
        few_shot = []

    return AthleteContext(
        athlete_id=athlete_id,
        athlete_name=athlete_name,
        coach_persona=persona,
        methodology_summary=methodology_summary,
        current_state=current_state,
        upcoming_workouts=upcoming,
        recent_memory=recent_memory,
        few_shot_examples=few_shot,
        sport_specialties=sport_specialties,
        athlete_goals=goals,
    )


def _summarise_methodology(playbook: dict) -> str:
    if not playbook:
        return "Polarized training model. Athlete wellbeing and injury prevention prioritized."
    parts = []
    desc = playbook.get("description") or playbook.get("playbook_name")
    if desc:
        parts.append(str(desc))
    sports = playbook.get("sport_specialties")
    if sports:
        parts.append(f"Sports: {', '.join(sports)}")
    biz = playbook.get("business_name")
    if biz:
        parts.append(f"Coaching brand: {biz}")
    return " | ".join(parts) if parts else "Standard endurance coaching methodology."


def _format_memory_states(states: list[dict]) -> str:
    if not states:
        return "No recent check-in history."
    lines = []
    for s in states:
        created = str(s.get("created_at") or "")[:10]
        state_type = str(s.get("state_type") or "state")
        summary = str(s.get("summary") or json.dumps(s.get("data") or {}))[:300]
        lines.append(f"[{created}] {state_type}: {summary}")
    return "\n".join(lines)


# ── Reasoning engine — dual-output generation ─────────────────────────────────

_REASONING_SYSTEM = """You are an AI reasoning engine for an endurance sports coaching platform.
Your role: reason about an athlete's situation and generate two outputs for the coach to review.

You have NO personality — you are a pure reasoning machine. The coach's persona layer will
wrap your output before anything reaches the athlete. Write in clear, neutral English.

ALWAYS respond with valid JSON matching this exact schema:
{{
  "message_draft": "<what to say to the athlete — warm, specific, actionable. 2-4 sentences.>",
  "message_reasoning": "<why this message — 1-2 sentences for the coach>",
  "plan_modification": {{
    "warranted": true | false,
    "workout_id": "<uuid of the specific workout to modify, or null>",
    "change_type": "reduce_duration | swap_type | move_day | remove | increase_intensity | reduce_intensity",
    "change_value": "<specific value, e.g. '45 min instead of 90' or 'easy Z2 run instead of tempo'>",
    "reasoning": "<evidence-based reason referencing biometrics or history>"
  }} | null
}}

Only set plan_modification to non-null when the message content genuinely warrants a training change.
Do not propose modifications for noise, general check-ins without red flags, or plan questions that
just need a text answer."""


@dataclass
class PlanModificationProposal:
    warranted: bool
    workout_id: str | None
    change_type: str
    change_value: str
    reasoning: str


@dataclass
class SuggestionOutput:
    message_draft: str
    message_reasoning: str
    plan_modification: PlanModificationProposal | None
    raw_ai_output: dict
    input_tokens: int = 0
    output_tokens: int = 0
    latency_ms: int = 0


def generate_suggestion(
    *,
    message_text: str,
    message_class: MessageClass,
    context: AthleteContext,
    llm: LLMClient | None = None,
) -> SuggestionOutput:
    """Run the reasoning engine to generate message draft + optional plan mod.

    This is the core AI call. Assembles full context into the prompt and
    calls the LLM. Returns structured SuggestionOutput.
    """
    client = llm or LLMClient()
    user_prompt = _build_reasoning_prompt(
        message_text=message_text,
        message_class=message_class,
        context=context,
    )

    try:
        response = client.chat_completions(
            system=_REASONING_SYSTEM,
            user=user_prompt,
        )
        data = _parse_json_safe(response.content)

        # Parse plan modification
        plan_mod_raw = data.get("plan_modification")
        plan_mod = None
        if plan_mod_raw and isinstance(plan_mod_raw, dict) and plan_mod_raw.get("warranted"):
            plan_mod = PlanModificationProposal(
                warranted=True,
                workout_id=plan_mod_raw.get("workout_id"),
                change_type=str(plan_mod_raw.get("change_type") or "reduce_duration"),
                change_value=str(plan_mod_raw.get("change_value") or ""),
                reasoning=str(plan_mod_raw.get("reasoning") or ""),
            )

        return SuggestionOutput(
            message_draft=str(data.get("message_draft") or ""),
            message_reasoning=str(data.get("message_reasoning") or ""),
            plan_modification=plan_mod,
            raw_ai_output=data,
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            latency_ms=response.latency_ms,
        )

    except Exception as exc:
        logger.exception("[reasoning] Suggestion generation failed for athlete %s", context.athlete_id)
        raise RuntimeError(f"Suggestion generation failed: {exc}") from exc


def _build_reasoning_prompt(
    *,
    message_text: str,
    message_class: MessageClass,
    context: AthleteContext,
) -> str:
    """Assemble the full context-rich user prompt for the reasoning engine."""
    upcoming_text = "No upcoming workouts scheduled."
    if context.upcoming_workouts:
        lines = []
        for w in context.upcoming_workouts:
            date = str(w.get("scheduled_date") or "")
            wtype = str(w.get("workout_type") or "workout")
            dur = w.get("duration_minutes")
            wid = str(w.get("id") or "")
            desc = str(w.get("description") or "")[:100]
            line = f"  [{date}] {wtype}"
            if dur:
                line += f" — {dur}min"
            if desc:
                line += f" — {desc}"
            if wid:
                line += f" (id: {wid})"
            lines.append(line)
        upcoming_text = "\n".join(lines)

    biometrics_text = "No biometric data available."
    if context.current_state:
        cs = context.current_state
        parts = []
        if cs.get("oura_readiness_score"):
            parts.append(f"Oura readiness: {cs['oura_readiness_score']}/100")
        if cs.get("oura_hrv_balance"):
            parts.append(f"HRV balance: {cs['oura_hrv_balance']}")
        if cs.get("oura_sleep_score"):
            parts.append(f"Sleep score: {cs['oura_sleep_score']}/100")
        if cs.get("resting_hr"):
            parts.append(f"Resting HR: {cs['resting_hr']} bpm")
        if cs.get("soreness"):
            parts.append(f"Reported soreness: {cs['soreness']}")
        if cs.get("hrv_flag"):
            parts.append(f"HRV flag: {cs['hrv_flag']}")
        biometrics_text = " | ".join(parts) if parts else json.dumps(cs)[:300]

    few_shot_text = ""
    if context.few_shot_examples:
        examples = []
        for d in context.few_shot_examples[:3]:
            orig = d.get("original_ai_output") or {}
            final = d.get("final_output") or {}
            action = str(d.get("action") or "approved")
            orig_msg = str(orig.get("message_draft") or "")[:150]
            final_msg = str(final.get("message_draft") or orig_msg)[:150]
            examples.append(
                f"  [{action}] Original: {orig_msg}\n"
                f"           Final sent: {final_msg}"
            )
        few_shot_text = "\n\nPAST COACH DECISIONS (learn the coach's style from these):\n" + "\n".join(examples)

    return f"""ATHLETE: {context.athlete_name}
SPORT: {', '.join(context.sport_specialties) if context.sport_specialties else 'Endurance'}
GOALS: {context.athlete_goals or 'Not specified'}

COACHING METHODOLOGY:
{context.methodology_summary}

INCOMING MESSAGE (classified as: {message_class}):
"{message_text}"

CURRENT BIOMETRICS:
{biometrics_text}

UPCOMING WORKOUTS:
{upcoming_text}

RECENT HISTORY:
{context.recent_memory}{few_shot_text}

Generate the message draft and plan modification proposal (if warranted) based on this full context.
Reference specific workouts by their id when proposing modifications."""


# ── Interaction Agent — persona wrapper ───────────────────────────────────────

_INTERACTION_SYSTEM = """You are the Interaction Agent for a coaching platform. Your job is to
rewrite the provided message draft in the coach's exact voice and style.

Rules:
- Preserve all factual content and training recommendations exactly
- Adopt the coach's tone, vocabulary, and communication style completely
- Do NOT add new advice or change any training specifics
- Keep it the same length — do not pad or compress
- Return ONLY the rewritten message text, no JSON, no explanation"""


def apply_coach_persona(
    *,
    message_draft: str,
    coach_persona: str,
    athlete_name: str,
    llm: LLMClient | None = None,
) -> tuple[str, LLMResponse]:
    """Wrap the message draft in the coach's voice (Interaction Agent).

    Returns the personalized message and the LLMResponse for token logging.
    Falls back to the original draft if this call fails.
    """
    client = llm or LLMClient()
    try:
        response = client.chat_completions(
            system=f"{_INTERACTION_SYSTEM}\n\nCOACH VOICE & STYLE:\n{coach_persona}",
            user=f"Athlete name: {athlete_name}\n\nMessage draft to rewrite:\n{message_draft}",
        )
        return response.content.strip(), response
    except Exception:
        logger.warning("[interaction_agent] Persona wrapping failed, using raw draft", exc_info=True)
        # Return a fake response for token logging
        fake = LLMResponse(content=message_draft, input_tokens=0, output_tokens=0, model="fallback", latency_ms=0)
        return message_draft, fake


# ── Coach decision logging ─────────────────────────────────────────────────────

CoachAction = Literal["approved", "rejected", "modified"]
DecisionType = Literal["message", "plan_modification"]


def log_coach_decision(
    *,
    supabase: Any,
    coach_id: str,
    athlete_id: str,
    suggestion_id: str,
    decision_type: DecisionType,
    action: CoachAction,
    original_ai_output: dict,
    final_output: dict,
    rejection_reason: str | None = None,
) -> str | None:
    """Insert a row into coach_decisions. Returns the new decision id or None on failure."""
    try:
        row = {
            "coach_id": coach_id,
            "athlete_id": athlete_id,
            "suggestion_id": suggestion_id,
            "decision_type": decision_type,
            "action": action,
            "original_ai_output": original_ai_output,
            "final_output": final_output,
            "rejection_reason": rejection_reason,
        }
        result = supabase.table("coach_decisions").insert(row).execute()
        if result.data:
            decision_id = result.data[0].get("id")
            logger.info("[decisions] Logged %s %s for suggestion %s", action, decision_type, suggestion_id)
            return decision_id
    except Exception:
        logger.warning("[decisions] Failed to log coach decision (non-fatal)", exc_info=True)
    return None


# ── Full pipeline — single entry point ────────────────────────────────────────

@dataclass
class PipelineResult:
    """Everything the API endpoint needs to build a suggestion row and respond."""
    suggestion_id: str | None               # set after DB insert by caller
    athlete_id: str
    athlete_name: str
    message_class: MessageClass
    classification_confidence: float
    message_draft: str                      # raw, pre-persona
    message_draft_personalized: str         # after Interaction Agent
    message_reasoning: str
    plan_modification: PlanModificationProposal | None
    raw_ai_output: dict
    # Token telemetry
    classifier_tokens_in: int = 0
    classifier_tokens_out: int = 0
    reasoning_tokens_in: int = 0
    reasoning_tokens_out: int = 0
    persona_tokens_in: int = 0
    persona_tokens_out: int = 0
    total_latency_ms: int = 0


def run_pipeline(
    *,
    supabase: Any,
    coach_id: str,
    athlete_id: str,
    message_text: str,
    llm: LLMClient | None = None,
) -> PipelineResult:
    """Full COA-64 pipeline: classify → context → reason → personalize.

    Synchronous. Returns PipelineResult. Callers are responsible for:
    1. Inserting the suggestion row into the DB
    2. Calling UsageLogger.log_sync() for each token group
    3. Displaying the result to the coach for approval
    """
    t0_total = __import__("time").monotonic()
    client = llm or LLMClient()

    # Step 1: Classify
    classification = classify_message(message_text, llm=client)
    logger.info(
        "[pipeline] athlete=%s class=%s confidence=%.2f",
        athlete_id[:8], classification.message_class, classification.confidence
    )

    # Noise: skip full pipeline
    if classification.message_class == "noise":
        total_ms = int((__import__("time").monotonic() - t0_total) * 1000)
        return PipelineResult(
            suggestion_id=None,
            athlete_id=athlete_id,
            athlete_name="",
            message_class="noise",
            classification_confidence=classification.confidence,
            message_draft="",
            message_draft_personalized="",
            message_reasoning="Message classified as noise — no coach action required.",
            plan_modification=None,
            raw_ai_output={},
            classifier_tokens_in=classification.input_tokens,
            classifier_tokens_out=classification.output_tokens,
            total_latency_ms=total_ms,
        )

    # Step 2: Build context
    context = build_athlete_context(supabase=supabase, coach_id=coach_id, athlete_id=athlete_id)

    # Step 3: Generate suggestion (ReasoningAgent)
    suggestion = generate_suggestion(
        message_text=message_text,
        message_class=classification.message_class,
        context=context,
        llm=client,
    )

    # Step 4: Apply coach persona (InteractionAgent)
    personalized_msg, persona_response = apply_coach_persona(
        message_draft=suggestion.message_draft,
        coach_persona=context.coach_persona,
        athlete_name=context.athlete_name,
        llm=client,
    )

    total_ms = int((__import__("time").monotonic() - t0_total) * 1000)
    logger.info(
        "[pipeline] Complete. athlete=%s class=%s plan_mod=%s total_ms=%d",
        athlete_id[:8],
        classification.message_class,
        suggestion.plan_modification is not None,
        total_ms,
    )

    return PipelineResult(
        suggestion_id=None,
        athlete_id=athlete_id,
        athlete_name=context.athlete_name,
        message_class=classification.message_class,
        classification_confidence=classification.confidence,
        message_draft=suggestion.message_draft,
        message_draft_personalized=personalized_msg,
        message_reasoning=suggestion.message_reasoning,
        plan_modification=suggestion.plan_modification,
        raw_ai_output=suggestion.raw_ai_output,
        classifier_tokens_in=classification.input_tokens,
        classifier_tokens_out=classification.output_tokens,
        reasoning_tokens_in=suggestion.input_tokens,
        reasoning_tokens_out=suggestion.output_tokens,
        persona_tokens_in=persona_response.input_tokens,
        persona_tokens_out=persona_response.output_tokens,
        total_latency_ms=total_ms,
    )


# ── Helpers ────────────────────────────────────────────────────────────────────

def _parse_json_safe(text: str) -> dict:
    """Extract the first JSON object from LLM output, stripping markdown fences."""
    text = text.strip()
    # Strip ```json ... ``` fences if present
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(
            line for line in lines
            if not line.strip().startswith("```")
        ).strip()
    # Find first { ... }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass
    logger.warning("[parse_json_safe] Could not parse JSON from: %s", text[:200])
    return {}


__all__ = [
    "classify_message",
    "ClassificationResult",
    "MessageClass",
    "build_athlete_context",
    "AthleteContext",
    "generate_suggestion",
    "SuggestionOutput",
    "apply_coach_persona",
    "log_coach_decision",
    "run_pipeline",
    "PipelineResult",
    "PlanModificationProposal",
]
