"""Timezone-aware scheduled check-in worker orchestration."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timezone
from typing import Any, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.checkinsend_log import CheckinSendLog
from app.services.scope import DataScope, apply_scope_payload, apply_scope_query, require_scope


class SupabaseClientProtocol(Protocol):
    async def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


class TaskQueueProtocol(Protocol):
    async def enqueue(self, task_name: str, payload: dict[str, Any]) -> Any:  # pragma: no cover - runtime adapter
        ...


@dataclass(slots=True)
class CheckinAthlete:
    athlete_id: str
    phone_number: str
    timezone_name: str
    display_name: str | None = None
    enabled: bool = True
    scheduled_time: time = field(default_factory=lambda: time(hour=8, minute=0))
    trigger_window_minutes: int = 30


@dataclass(slots=True)
class CheckinSchedulerConfig:
    athletes_table: str = "athletes"
    send_log_table: str = "checkin_send_logs"
    default_scheduled_time: time = field(default_factory=lambda: time(hour=8, minute=0))
    default_trigger_window_minutes: int = 30
    task_name: str = "send_checkin_whatsapp"
    checkin_link: str | None = None
    organization_id: str | None = None
    coach_id: str | None = None


@dataclass(slots=True)
class EnqueuedCheckinTask:
    athlete_id: str
    phone_number: str
    timezone_name: str
    scheduled_for: datetime
    dedupe_key: str
    task_name: str
    queue_result: Any = None


@dataclass(slots=True)
class CheckinSchedulerResult:
    scanned: int = 0
    due: int = 0
    reserved: int = 0
    skipped: int = 0
    tasks: list[EnqueuedCheckinTask] = field(default_factory=list)


class CheckinScheduler:
    """Finds due athletes, reserves a send slot, and enqueues outbound tasks."""

    def __init__(
        self,
        supabase_client: SupabaseClientProtocol,
        task_queue: TaskQueueProtocol,
        config: CheckinSchedulerConfig | None = None,
        scope: DataScope | None = None,
    ) -> None:
        self.supabase_client = supabase_client
        self.task_queue = task_queue
        self.config = config or CheckinSchedulerConfig()
        self.scope = scope or DataScope(organization_id=self.config.organization_id, coach_id=self.config.coach_id)

    async def run(self, now: datetime | None = None) -> CheckinSchedulerResult:
        now_utc = self._ensure_utc(now or datetime.now(timezone.utc))
        athletes = await self.list_candidate_athletes()
        result = CheckinSchedulerResult(scanned=len(athletes))

        for athlete in athletes:
            if not athlete.enabled:
                result.skipped += 1
                continue

            local_now = now_utc.astimezone(self._get_zoneinfo(athlete.timezone_name))
            scheduled_local = self._scheduled_local_datetime(athlete, local_now)

            if not self._is_due(local_now, scheduled_local, athlete.trigger_window_minutes):
                continue

            due_date = scheduled_local.date()
            send_log = CheckinSendLog(
                athlete_id=athlete.athlete_id,
                scheduled_for=scheduled_local,
                timezone_name=athlete.timezone_name,
                message_fingerprint=self._fingerprint(athlete, due_date),
            )

            reserved = await self._reserve_send_slot(send_log)
            if not reserved:
                result.skipped += 1
                continue

            payload = {
                "athlete_id": athlete.athlete_id,
                "phone_number": athlete.phone_number,
                "display_name": athlete.display_name,
                "timezone_name": athlete.timezone_name,
                "scheduled_for": scheduled_local.isoformat(),
                "dedupe_key": send_log.dedupe_key,
                "checkin_link": self.config.checkin_link,
            }
            queue_result = await self.task_queue.enqueue(self.config.task_name, payload)
            result.due += 1
            result.reserved += 1
            result.tasks.append(
                EnqueuedCheckinTask(
                    athlete_id=athlete.athlete_id,
                    phone_number=athlete.phone_number,
                    timezone_name=athlete.timezone_name,
                    scheduled_for=scheduled_local,
                    dedupe_key=send_log.dedupe_key,
                    task_name=self.config.task_name,
                    queue_result=queue_result,
                )
            )

        return result

    async def list_candidate_athletes(self) -> list[CheckinAthlete]:
        """Load athlete scheduling rows from Supabase and normalize them."""

        scope = require_scope(self.scope, context="Check-in scheduler")
        table = self.supabase_client.table(self.config.athletes_table)
        query = table.select("*") if hasattr(table, "select") else table
        query = apply_scope_query(query, scope)
        if hasattr(query, "eq"):
            query = query.eq("checkins_enabled", True)
        if hasattr(query, "execute"):
            response = await query.execute()
        elif hasattr(query, "data"):
            response = query
        else:
            response = await query

        rows = self._extract_rows(response)
        athletes: list[CheckinAthlete] = []
        for row in rows:
            timezone_name = str(row.get("timezone_name") or row.get("timezone") or "UTC")
            scheduled_time = self._parse_time(row.get("scheduled_time")) or self.config.default_scheduled_time
            enabled = row.get("checkins_enabled")
            if enabled is None:
                enabled = row.get("enabled", True)
            athletes.append(
                CheckinAthlete(
                    athlete_id=str(row["id"] if "id" in row else row["athlete_id"]),
                    phone_number=str(row.get("phone_number") or row.get("whatsapp_number") or ""),
                    timezone_name=timezone_name,
                    display_name=row.get("display_name") or row.get("name"),
                    enabled=bool(enabled),
                    scheduled_time=scheduled_time,
                    trigger_window_minutes=int(
                        row.get("trigger_window_minutes") or self.config.default_trigger_window_minutes
                    ),
                )
            )
        return athletes

    def should_trigger_for_athlete(self, athlete: CheckinAthlete, now: datetime | None = None) -> bool:
        """Return whether the current moment is inside the athlete's send window."""

        now_utc = self._ensure_utc(now or datetime.now(timezone.utc))
        local_now = now_utc.astimezone(self._get_zoneinfo(athlete.timezone_name))
        scheduled_local = self._scheduled_local_datetime(athlete, local_now)
        return self._is_due(local_now, scheduled_local, athlete.trigger_window_minutes)

    async def _reserve_send_slot(self, send_log: CheckinSendLog) -> bool:
        """Create or reuse a queued log row to prevent duplicate sends."""

        scope = require_scope(self.scope, context="Check-in scheduler send log")
        table = self.supabase_client.table(self.config.send_log_table)
        existing = None
        if hasattr(table, "select") and hasattr(table, "eq"):
            query = apply_scope_query(table.select("*").eq("dedupe_key", send_log.dedupe_key), scope)
            if hasattr(query, "execute"):
                response = await query.execute()
            else:
                response = await query
            rows = self._extract_rows(response)
            existing = rows[0] if rows else None

        if existing:
            status = str(existing.get("status", "queued"))
            return status not in {"queued", "sent"}

        payload = apply_scope_payload(send_log.to_row(), scope)
        if hasattr(table, "insert"):
            insert_result = table.insert(payload)
            if hasattr(insert_result, "execute"):
                await insert_result.execute()
            else:
                await insert_result
            return True

        if hasattr(table, "upsert"):
            await table.upsert(payload)
            return True

        return False

    @staticmethod
    def _ensure_utc(moment: datetime) -> datetime:
        if moment.tzinfo is None:
            return moment.replace(tzinfo=timezone.utc)
        return moment.astimezone(timezone.utc)

    @staticmethod
    def _get_zoneinfo(timezone_name: str) -> ZoneInfo:
        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError as exc:  # pragma: no cover - defensive
            raise ValueError(f"Unknown timezone: {timezone_name}") from exc

    @staticmethod
    def _scheduled_local_datetime(athlete: CheckinAthlete, local_now: datetime) -> datetime:
        return local_now.replace(
            hour=athlete.scheduled_time.hour,
            minute=athlete.scheduled_time.minute,
            second=athlete.scheduled_time.second,
            microsecond=0,
        )

    @staticmethod
    def _is_due(local_now: datetime, scheduled_local: datetime, window_minutes: int) -> bool:
        delta = local_now - scheduled_local
        return delta.total_seconds() >= 0 and delta.total_seconds() < window_minutes * 60

    @staticmethod
    def _parse_time(value: Any) -> time | None:
        if value in (None, ""):
            return None
        if isinstance(value, time):
            return value
        if isinstance(value, str):
            parts = value.split(":")
            if len(parts) < 2:
                return None
            hour = int(parts[0])
            minute = int(parts[1])
            second = int(parts[2]) if len(parts) > 2 else 0
            return time(hour=hour, minute=minute, second=second)
        return None

    @staticmethod
    def _extract_rows(response: Any) -> list[dict[str, Any]]:
        if response is None:
            return []
        if isinstance(response, list):
            return [row for row in response if isinstance(row, dict)]
        if isinstance(response, dict):
            data = response.get("data")
            if isinstance(data, list):
                return [row for row in data if isinstance(row, dict)]
            if isinstance(data, dict):
                return [data]
            return [response]
        if hasattr(response, "data"):
            data = getattr(response, "data")
            if isinstance(data, list):
                return [row for row in data if isinstance(row, dict)]
            if isinstance(data, dict):
                return [data]
        return []

    @staticmethod
    def _fingerprint(athlete: CheckinAthlete, day: date) -> str:
        import hashlib

        payload = f"{athlete.athlete_id}:{day.isoformat()}:{athlete.scheduled_time.strftime('%H:%M')}"
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class WhatsAppTaskAdapter:
    """Concrete TaskQueueProtocol that sends check-in messages via WhatsApp."""

    def __init__(self, whatsapp_client: Any, supabase_client: Any) -> None:
        self.whatsapp_client = whatsapp_client
        self.supabase_client = supabase_client

    # ------------------------------------------------------------------
    # COA-39: fetch athlete context for personalised check-in message
    # ------------------------------------------------------------------

    def _sync_rows(self, query: Any) -> list[dict[str, Any]]:
        """Execute a Supabase query synchronously and return row list."""
        result = query.execute()
        data = getattr(result, "data", result)
        if isinstance(data, list):
            return [r for r in data if isinstance(r, dict)]
        if isinstance(data, dict):
            return [data]
        return []

    def _fetch_athlete_context(self, athlete_id: str) -> dict[str, Any]:
        """
        Return a dict with:
          current_state   – oura_readiness_score, oura_avg_hrv, oura_sleep_score,
                            predictive_flags, training_phase
          stable_profile  – sport, target_race, injury_history, coach_notes
          memory_summary  – rolling AI memory summary
          last_checkin    – most recent athlete message text
          last_reply      – most recent coach reply or approved AI draft
          recent_workouts – last 5 workouts (type, date, distance, notes, status)
        Falls back to empty dict on any error.
        """
        import logging as _logging
        from datetime import date, timedelta
        _logger = _logging.getLogger(__name__)
        ctx: dict[str, Any] = {}

        # ── Athlete profile + biometrics ──────────────────────────────────────
        try:
            athlete_rows = self._sync_rows(
                self.supabase_client.table("athletes")
                .select("current_state, stable_profile, memory_summary")
                .eq("id", athlete_id)
                .limit(1)
            )
            if athlete_rows:
                ctx["current_state"] = athlete_rows[0].get("current_state") or {}
                ctx["stable_profile"] = athlete_rows[0].get("stable_profile") or {}
                ctx["memory_summary"] = (athlete_rows[0].get("memory_summary") or "").strip()
        except Exception as exc:
            _logger.warning("[checkin] Could not fetch athlete row for %s: %s", athlete_id, exc)

        # ── Recent conversation (last 3 check-ins + coach replies) ────────────
        try:
            suggestion_rows = self._sync_rows(
                self.supabase_client.table("suggestions")
                .select("id, suggestion_text, coach_reply, status, created_at")
                .eq("athlete_id", athlete_id)
                .order("created_at", desc=True)
                .limit(3)
            )
            thread: list[dict[str, str]] = []
            for row in suggestion_rows:
                checkin_rows = self._sync_rows(
                    self.supabase_client.table("athlete_checkins")
                    .select("message_text")
                    .eq("suggestion_id", row["id"])
                    .limit(1)
                )
                athlete_msg = (checkin_rows[0].get("message_text") or "").strip() if checkin_rows else ""
                coach_reply = (row.get("coach_reply") or "").strip()
                if not coach_reply and row.get("status") == "approved":
                    coach_reply = (row.get("suggestion_text") or "")[:200].strip()
                if athlete_msg:
                    thread.append({"athlete": athlete_msg, "coach": coach_reply})
            ctx["conversation_thread"] = thread
            # Backward compat — keep last_checkin / last_reply for _build_checkin_message
            if thread:
                ctx["last_checkin"] = thread[0].get("athlete", "")
                ctx["last_reply"] = thread[0].get("coach", "")
        except Exception as exc:
            _logger.warning("[checkin] Could not fetch conversation thread for %s: %s", athlete_id, exc)

        # ── Recent workouts (last 5 days) ─────────────────────────────────────
        try:
            since = (date.today() - timedelta(days=5)).isoformat()
            workout_rows = self._sync_rows(
                self.supabase_client.table("workouts")
                .select("session_type, scheduled_date, distance_km, duration_min, coaching_notes, status, title")
                .eq("athlete_id", athlete_id)
                .gte("scheduled_date", since)
                .order("scheduled_date", desc=True)
                .limit(5)
            )
            ctx["recent_workouts"] = workout_rows
        except Exception as exc:
            _logger.warning("[checkin] Could not fetch recent workouts for %s: %s", athlete_id, exc)

        return ctx

    # ------------------------------------------------------------------
    # Personalized question generation (LLM-driven)
    # ------------------------------------------------------------------

    @staticmethod
    def _generate_personalized_questions(display_name: str, ctx: dict[str, Any]) -> list[str]:
        """
        Use the LLM to generate 3 personalized check-in questions based on:
        - Recent workouts (type, intensity, date)
        - Last conversation thread (what athlete said, what coach replied)
        - Biometrics (readiness, HRV, sleep)
        - Memory summary (persistent athlete notes)

        Falls back to DEFAULT_QUESTIONS if the LLM call fails.
        Examples of what this produces:
          "How are your legs feeling after that threshold run yesterday?"
          "You mentioned tight calves last time — is that still bothering you?"
          "Your readiness was 58 this morning — how's the energy level?"
        """
        import logging as _logging
        _logger = _logging.getLogger(__name__)

        from app.services.morning_pulse import DEFAULT_QUESTIONS

        try:
            from app.services.llm_client import LLMClient

            cs = ctx.get("current_state") or {}
            sp = ctx.get("stable_profile") or {}
            memory = ctx.get("memory_summary") or ""
            workouts = ctx.get("recent_workouts") or []
            thread = ctx.get("conversation_thread") or []

            # Build workout context block
            workout_lines = []
            for w in workouts:
                wdate = w.get("scheduled_date", "")
                wtype = w.get("session_type") or w.get("title") or "workout"
                wdist = f"{w.get('distance_km')}km" if w.get("distance_km") else ""
                wdur = f"{w.get('duration_min')}min" if w.get("duration_min") else ""
                wnotes = w.get("coaching_notes") or ""
                wstatus = w.get("status") or ""
                line = f"- {wdate}: {wtype} {wdist} {wdur} [{wstatus}]"
                if wnotes:
                    line += f" — notes: {wnotes[:80]}"
                workout_lines.append(line.strip())

            # Build conversation context block
            conv_lines = []
            for turn in thread[:2]:
                if turn.get("athlete"):
                    conv_lines.append(f"Athlete said: \"{turn['athlete'][:120]}\"")
                if turn.get("coach"):
                    conv_lines.append(f"Coach replied: \"{turn['coach'][:120]}\"")

            # Build biometrics block
            bio_parts = []
            if cs.get("oura_readiness_score") is not None:
                bio_parts.append(f"Readiness: {int(cs['oura_readiness_score'])}/100")
            if cs.get("oura_avg_hrv") is not None:
                bio_parts.append(f"HRV: {int(cs['oura_avg_hrv'])}ms")
            if cs.get("oura_sleep_score") is not None:
                bio_parts.append(f"Sleep score: {int(cs['oura_sleep_score'])}/100")

            context_block = "\n".join(filter(None, [
                f"Athlete name: {display_name}",
                f"Sport: {sp.get('sport') or 'endurance'}",
                f"Target race: {sp.get('target_race') or 'n/a'}",
                ("Recent workouts:\n" + "\n".join(workout_lines)) if workout_lines else "",
                ("Last conversation:\n" + "\n".join(conv_lines)) if conv_lines else "",
                ("Biometrics today: " + ", ".join(bio_parts)) if bio_parts else "",
                (f"Athlete memory notes: {memory[:300]}") if memory else "",
            ]))

            client = LLMClient()
            resp = client.chat_completions(
                system=(
                    "You are an expert endurance sports coach AI. "
                    "Generate exactly 3 personalized morning check-in questions for the athlete. "
                    "Rules:\n"
                    "1. Each question must be specific — reference an actual recent workout, "
                    "complaint, or metric if available. NOT generic.\n"
                    "2. Examples of GOOD questions:\n"
                    "   - 'How are your legs feeling after yesterday's threshold run?'\n"
                    "   - 'You mentioned tight calves last time — is that still an issue?'\n"
                    "   - 'Your readiness was 62 this morning — how's the energy?'\n"
                    "3. Examples of BAD (generic) questions:\n"
                    "   - 'How are you feeling today?'\n"
                    "   - 'How did you sleep?'\n"
                    "4. Keep each question under 20 words, conversational, no jargon.\n"
                    "5. Return ONLY a JSON array of 3 strings. No other text.\n"
                    "   Example: [\"Q1\", \"Q2\", \"Q3\"]"
                ),
                user=f"Athlete context:\n{context_block}\n\nGenerate 3 personalized questions:",
            )
            import json as _json
            raw = resp.content.strip()
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            questions = _json.loads(raw)
            if isinstance(questions, list) and len(questions) >= 1 and all(isinstance(q, str) for q in questions):
                # Pad to 3 if LLM returned fewer
                while len(questions) < 3:
                    questions.append(DEFAULT_QUESTIONS[len(questions)])
                _logger.info(
                    "[checkin] Generated personalized questions for %s: %s",
                    display_name, questions
                )
                return questions[:3]
        except Exception as exc:
            _logger.warning("[checkin] Personalized question generation failed, using defaults: %s", exc)

        return list(DEFAULT_QUESTIONS)

    # ------------------------------------------------------------------
    # COA-39: build a personalised check-in message
    # ------------------------------------------------------------------

    @staticmethod
    def _build_checkin_message(display_name: str, ctx: dict[str, Any]) -> str:
        """
        Compose a morning check-in message that:
        1. Opens with a biometrics-aware hook based on Oura data
        2. References the last coach/athlete thread if relevant
        3. Closes with an open-ended prompt
        """
        cs = ctx.get("current_state") or {}
        name = display_name or "there"

        # --- Biometrics hook ---
        readiness = cs.get("oura_readiness_score")
        hrv = cs.get("oura_avg_hrv")
        sleep = cs.get("oura_sleep_score")

        bio_line = ""
        if readiness is not None:
            r = int(readiness)
            if r >= 85:
                bio_line = f"Your Oura readiness is {r} this morning 🟢 — your body is primed."
            elif r >= 70:
                bio_line = f"Your Oura readiness is {r} this morning 🟡 — solid, some fuel left in the tank."
            elif r >= 55:
                bio_line = f"Your readiness came in at {r} this morning 🟠 — looks like a recovery-focused day."
            else:
                bio_line = f"Your readiness is {r} this morning 🔴 — your body is asking for rest. Let's talk about it."

            # Enrich with HRV if available
            if hrv is not None:
                bio_line += f" HRV: {int(hrv)}ms."

            # Sleep callout if notably low
            if sleep is not None and int(sleep) < 70:
                bio_line += f" Sleep score was {int(sleep)} — worth noting."

        elif sleep is not None:
            # No readiness but we have sleep
            s = int(sleep)
            if s >= 85:
                bio_line = f"Your sleep score was {s} last night 🟢 — well rested."
            elif s >= 70:
                bio_line = f"Your sleep score was {s} last night 🟡 — decent recovery."
            else:
                bio_line = f"Your sleep score was {s} last night 🔴 — recovery may be limited today."

        # Predictive flags — surface any HIGH priority ones
        flags = cs.get("predictive_flags") or []
        high_flags = [f["label"] for f in flags if isinstance(f, dict) and f.get("priority") == "high"]
        flag_line = ""
        if high_flags:
            flag_line = f"⚠️ Flagged: {', '.join(high_flags)}."

        # --- Conversation thread hook ---
        last_checkin = (ctx.get("last_checkin") or "").strip()
        thread_line = ""
        if last_checkin and len(last_checkin) > 10:
            # Truncate long messages to a natural snippet
            snippet = last_checkin[:120].rsplit(" ", 1)[0] if len(last_checkin) > 120 else last_checkin
            thread_line = f"Last time you mentioned: \"{snippet}\" — any update on that?"

        # --- Assemble ---
        parts = [f"Good morning {name}! ☀️"]
        if bio_line:
            parts.append(bio_line)
        if flag_line:
            parts.append(flag_line)
        if thread_line:
            parts.append(thread_line)
        parts.append("How are you feeling today? Anything on training, recovery, or how yesterday went?")

        return " ".join(parts)

    # ------------------------------------------------------------------

    async def enqueue(self, task_name: str, payload: dict[str, Any]) -> Any:
        if task_name != "send_checkin_whatsapp":
            return None

        athlete_id = payload.get("athlete_id")
        phone = payload.get("phone_number")
        display_name = payload.get("display_name") or "there"
        dedupe_key = payload.get("dedupe_key")

        import logging as _logging
        _logger = _logging.getLogger(__name__)

        # COA-39: fetch biometrics + conversation context, build personalised message
        ctx: dict[str, Any] = {}
        if athlete_id and self.supabase_client:
            try:
                ctx = self._fetch_athlete_context(athlete_id)
            except Exception as exc:
                _logger.warning("[checkin] Context fetch failed for %s — using generic message: %s", athlete_id, exc)

        # COA-103: Use structured morning pulse (3-question sequence).
        # Questions are now LLM-generated and personalized to the athlete's recent
        # workouts, conversation history, and biometrics. Falls back to generic
        # questions if LLM call fails.
        use_pulse = False
        pulse_q1: str | None = None
        try:
            from app.services.morning_pulse import start_session
            athlete_rows = self._sync_rows(
                self.supabase_client.table("athletes")
                .select("current_state")
                .eq("id", athlete_id)
                .limit(1)
            ) if athlete_id and self.supabase_client else []
            if athlete_rows:
                current_state = athlete_rows[0].get("current_state") or {}
                # Generate personalized questions using full athlete context already fetched
                questions = self._generate_personalized_questions(display_name, ctx)
                pulse_q1 = start_session(
                    supabase=self.supabase_client,
                    athlete_id=athlete_id,
                    current_state=current_state,
                    questions=questions,
                )
                use_pulse = True
                _logger.info(
                    "[COA-103] Using personalized morning pulse for athlete=%s Q1=%s",
                    athlete_id[:8] if athlete_id else "?",
                    pulse_q1[:60] if pulse_q1 else "?",
                )
        except Exception as pulse_exc:
            _logger.warning("[COA-103] Pulse init failed for %s, falling back: %s", athlete_id, pulse_exc)

        if use_pulse and pulse_q1:
            # Send the morning greeting + Q1
            name = display_name or "there"
            msg = (
                f"Good morning {name}! ☀️ Quick morning check-in from your coach:\n\n"
                f"*Q1/3:* {pulse_q1}"
            )
        else:
            msg = self._build_checkin_message(display_name, ctx)
        _logger.info("[checkin] Sending morning message to %s (%d chars)", athlete_id, len(msg))

        try:
            await self.whatsapp_client.send_message(to=phone, body=msg)
            if dedupe_key:
                self.supabase_client.table("checkin_send_logs").update({
                    "status": "sent",
                    "sent_at": datetime.now(timezone.utc).isoformat(),
                }).eq("dedupe_key", dedupe_key).execute()
            return {"status": "sent", "athlete_id": athlete_id}
        except Exception as exc:
            _logger.error("Failed to send check-in to %s: %s", athlete_id, exc)
            if dedupe_key:
                try:
                    self.supabase_client.table("checkin_send_logs").update({
                        "status": "failed",
                        "error_message": str(exc)[:500],
                    }).eq("dedupe_key", dedupe_key).execute()
                except Exception:
                    pass
            return {"status": "failed", "athlete_id": athlete_id, "error": str(exc)}


__all__ = [
    "CheckinAthlete",
    "CheckinScheduler",
    "CheckinSchedulerConfig",
    "CheckinSchedulerResult",
    "EnqueuedCheckinTask",
    "WhatsAppTaskAdapter",
]
