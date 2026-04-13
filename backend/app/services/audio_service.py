"""Audio processing service for athlete voice memos.

This service provides:
- Whisper-based speech-to-text transcription for uploaded audio memos.
- Structured metadata extraction from the resulting transcript.
- Lightweight fallback metadata when extraction cannot reach the LLM provider.

The implementation intentionally avoids SDK dependencies so it can run with the
project's existing requirements using standard-library HTTP calls.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_TRANSCRIPTION_MODEL = os.getenv("OPENAI_TRANSCRIPTION_MODEL", "whisper-1").strip() or "whisper-1"
DEFAULT_METADATA_MODEL = os.getenv("OPENAI_METADATA_MODEL", os.getenv("OPENAI_MODEL", "gpt-4o-mini")).strip() or "gpt-4o-mini"
DEFAULT_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
DEFAULT_TIMEOUT_SECONDS = float(os.getenv("OPENAI_TIMEOUT_SECONDS", "120"))


class AudioServiceError(RuntimeError):
    pass


@dataclass(slots=True)
class AudioServiceConfig:
    api_key: str | None = field(default_factory=lambda: os.getenv("OPENAI_API_KEY", os.getenv("LLM_API_KEY", "")).strip() or None)
    base_url: str = field(default_factory=lambda: os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/"))
    transcription_model: str = field(default_factory=lambda: DEFAULT_TRANSCRIPTION_MODEL)
    metadata_model: str = field(default_factory=lambda: DEFAULT_METADATA_MODEL)
    timeout_seconds: float = field(default_factory=lambda: DEFAULT_TIMEOUT_SECONDS)


@dataclass(slots=True)
class AudioMemoInput:
    """Normalized input for an athlete voice memo."""

    audio_bytes: bytes | None = None
    audio_path: str | None = None
    filename: str | None = None
    mime_type: str | None = None
    athlete_id: str | None = None
    memo_id: str | None = None
    recorded_at: datetime | None = None
    duration_seconds: float | None = None
    language: str | None = None
    prompt: str | None = None
    context: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AudioTranscriptionResult:
    text: str
    model: str
    language: str | None
    duration_seconds: float | None
    segments: list[dict[str, Any]] = field(default_factory=list)
    provider: str = "openai"
    processed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AudioMemoMetadata:
    memo_summary: str
    athlete_id: str | None
    memo_id: str | None
    detected_language: str | None
    key_topics: list[str] = field(default_factory=list)
    training_signals: dict[str, list[str] | str | None] = field(default_factory=dict)
    action_items: list[str] = field(default_factory=list)
    follow_up_questions: list[str] = field(default_factory=list)
    evidence: list[dict[str, str]] = field(default_factory=list)
    confidence: float = 0.0
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AudioProcessingResult:
    input: AudioMemoInput
    transcription: AudioTranscriptionResult
    metadata: AudioMemoMetadata
    status: str
    provider: str
    transcription_model: str
    metadata_model: str
    processed_at: str
    warnings: list[str] = field(default_factory=list)


SYSTEM_PROMPT = """You extract structured metadata from athlete voice memo transcripts.

Rules:
- Output strict JSON only. No markdown, no commentary, no code fences.
- Preserve only claims supported by the transcript or explicit context.
- Do not infer medical diagnoses or private details that are not clearly stated.
- Keep the output concise and operational.
- Prefer coaching-relevant details: training load, fatigue, soreness, recovery, sleep, nutrition, race planning, motivation, and logistics.
- If a field is not supported, use null or an empty array/object as appropriate.

Target schema:
{
  "memo_summary": string,
  "athlete_id": string|null,
  "memo_id": string|null,
  "detected_language": string|null,
  "key_topics": [string],
  "training_signals": {
    "session_type": string|null,
    "intensity": string|null,
    "fatigue": [string],
    "recovery": [string],
    "injury_or_pain": [string],
    "biometrics": [string],
    "nutrition": [string],
    "sleep": [string],
    "race_or_event": [string]
  },
  "action_items": [string],
  "follow_up_questions": [string],
  "evidence": [
    {"claim": string, "snippet": string}
  ],
  "confidence": number
}
"""


class AudioService:
    def __init__(self, config: AudioServiceConfig | None = None) -> None:
        self.config = config or AudioServiceConfig()

    def process_voice_memo(self, memo: AudioMemoInput) -> AudioProcessingResult:
        """Transcribe a voice memo and extract structured metadata."""

        extracted_at = datetime.now(timezone.utc).isoformat()
        warnings: list[str] = []

        transcription = self.transcribe(memo)
        if not transcription.text.strip():
            warnings.append("Transcription returned no text.")
            metadata = self._fallback_metadata(memo, transcription, warnings=warnings)
            return AudioProcessingResult(
                input=memo,
                transcription=transcription,
                metadata=metadata,
                status="incomplete",
                provider=transcription.provider,
                transcription_model=transcription.model,
                metadata_model=self.config.metadata_model,
                processed_at=extracted_at,
                warnings=self._dedupe_strings(warnings),
            )

        try:
            metadata = self.extract_metadata(memo, transcription)
            status = "complete"
        except AudioServiceError as exc:
            warnings.append(str(exc))
            metadata = self._fallback_metadata(memo, transcription, warnings=warnings)
            status = "pending"

        return AudioProcessingResult(
            input=memo,
            transcription=transcription,
            metadata=metadata,
            status=status,
            provider=transcription.provider,
            transcription_model=transcription.model,
            metadata_model=self.config.metadata_model,
            processed_at=extracted_at,
            warnings=self._dedupe_strings(warnings),
        )

    def transcribe(self, memo: AudioMemoInput) -> AudioTranscriptionResult:
        """Send audio bytes to Whisper and return the transcript payload."""

        api_key = self._resolved_api_key()
        audio_bytes, filename = self._resolve_audio_input(memo)
        mime_type = memo.mime_type or self._guess_mime_type(filename)
        boundary = uuid.uuid4().hex
        url = f"{self.config.base_url}/audio/transcriptions"

        payload = self._build_multipart_payload(
            boundary=boundary,
            fields={
                "model": self.config.transcription_model,
                "response_format": "verbose_json",
                "temperature": "0",
                **({"language": memo.language} if memo.language else {}),
                **({"prompt": memo.prompt} if memo.prompt else {}),
            },
            file_field="file",
            filename=filename,
            content_type=mime_type,
            file_bytes=audio_bytes,
        )

        request = Request(
            url,
            data=payload,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )

        raw = self._request_json(request)
        text = self._string_value(raw.get("text"))
        language = self._string_value(raw.get("language")) or memo.language
        duration_seconds = self._float_value(raw.get("duration")) or memo.duration_seconds
        segments = raw.get("segments") if isinstance(raw.get("segments"), list) else []

        return AudioTranscriptionResult(
            text=text,
            model=self.config.transcription_model,
            language=language,
            duration_seconds=duration_seconds,
            segments=[segment for segment in segments if isinstance(segment, dict)],
            raw=raw,
        )

    def extract_metadata(self, memo: AudioMemoInput, transcription: AudioTranscriptionResult) -> AudioMemoMetadata:
        """Extract structured memo metadata from the transcript."""

        transcript = transcription.text.strip()
        if not transcript:
            raise AudioServiceError("A transcript is required for metadata extraction")

        api_key = self._resolved_api_key()
        url = f"{self.config.base_url}/chat/completions"
        prompt = self._build_metadata_prompt(memo, transcription)
        payload = {
            "model": self.config.metadata_model,
            "temperature": 0,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
        }

        request = Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )

        raw = self._request_json(request)
        try:
            content = raw["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise AudioServiceError("LLM response did not include structured metadata") from exc

        parsed = self._parse_json_object(content)
        return self._build_metadata(memo, transcription, parsed)

    def _fallback_metadata(
        self,
        memo: AudioMemoInput,
        transcription: AudioTranscriptionResult,
        *,
        warnings: list[str] | None = None,
    ) -> AudioMemoMetadata:
        transcript = transcription.text.strip()
        topics = self._extract_keywords(transcript)
        summary = transcript[:240] if transcript else "No transcript was produced."
        training_signals = {
            "session_type": self._first_matched_phrase(transcript, ["run", "ride", "swim", "lift", "workout", "interval", "easy day", "long run"]),
            "intensity": self._first_matched_phrase(transcript, ["easy", "moderate", "hard", "threshold", "race pace", "all-out"]),
            "fatigue": self._collect_mentions(transcript, ["fatigue", "tired", "exhausted", "heavy legs", "drained"]),
            "recovery": self._collect_mentions(transcript, ["recovery", "sleep", "rest", "deload", "nap"]),
            "injury_or_pain": self._collect_mentions(transcript, ["pain", "injury", "sore", "tight", "ache"]),
            "biometrics": self._collect_mentions(transcript, ["hrv", "heart rate", "sleep", "readiness", "resting heart rate"]),
            "nutrition": self._collect_mentions(transcript, ["nutrition", "fuel", "carb", "hydrate", "eat", "drink"]),
            "sleep": self._collect_mentions(transcript, ["sleep", "bed", "night", "awake"]),
            "race_or_event": self._collect_mentions(transcript, ["race", "event", "marathon", "ironman", "competition", "meet"]),
        }

        return AudioMemoMetadata(
            memo_summary=summary,
            athlete_id=memo.athlete_id,
            memo_id=memo.memo_id,
            detected_language=transcription.language or memo.language,
            key_topics=topics,
            training_signals=training_signals,
            action_items=[],
            follow_up_questions=self._default_follow_up_questions(memo, transcript),
            evidence=[],
            confidence=0.2 if transcript else 0.0,
            raw={
                "status": "fallback",
                "warnings": self._dedupe_strings(warnings or []),
                "word_count": self._word_count(transcript),
                "character_count": len(transcript),
            },
        )

    def _build_metadata(self, memo: AudioMemoInput, transcription: AudioTranscriptionResult, parsed: dict[str, Any]) -> AudioMemoMetadata:
        transcript = transcription.text.strip()
        training_signals = parsed.get("training_signals")
        if not isinstance(training_signals, dict):
            training_signals = {}

        normalized_signals: dict[str, list[str] | str | None] = {
            "session_type": self._string_value(training_signals.get("session_type")),
            "intensity": self._string_value(training_signals.get("intensity")),
            "fatigue": self._string_list(training_signals.get("fatigue")),
            "recovery": self._string_list(training_signals.get("recovery")),
            "injury_or_pain": self._string_list(training_signals.get("injury_or_pain")),
            "biometrics": self._string_list(training_signals.get("biometrics")),
            "nutrition": self._string_list(training_signals.get("nutrition")),
            "sleep": self._string_list(training_signals.get("sleep")),
            "race_or_event": self._string_list(training_signals.get("race_or_event")),
        }

        metadata = AudioMemoMetadata(
            memo_summary=self._string_value(parsed.get("memo_summary")) or transcript[:240],
            athlete_id=self._string_value(parsed.get("athlete_id")) or memo.athlete_id,
            memo_id=self._string_value(parsed.get("memo_id")) or memo.memo_id,
            detected_language=self._string_value(parsed.get("detected_language")) or transcription.language or memo.language,
            key_topics=self._string_list(parsed.get("key_topics")),
            training_signals=normalized_signals,
            action_items=self._string_list(parsed.get("action_items")),
            follow_up_questions=self._string_list(parsed.get("follow_up_questions")),
            evidence=self._normalize_evidence(parsed.get("evidence")),
            confidence=self._float_value(parsed.get("confidence"), default=0.0),
            raw={
                "status": "complete",
                "transcript_word_count": self._word_count(transcript),
                "transcript_character_count": len(transcript),
                "provider": transcription.provider,
                "transcription_model": transcription.model,
                "metadata_model": self.config.metadata_model,
                "prompt_context": memo.context,
                "transcription": transcription.raw,
                "metadata": parsed,
            },
        )

        return metadata

    def _build_metadata_prompt(self, memo: AudioMemoInput, transcription: AudioTranscriptionResult) -> str:
        context = {
            "athlete_id": memo.athlete_id,
            "memo_id": memo.memo_id,
            "recorded_at": memo.recorded_at.isoformat() if memo.recorded_at else None,
            "duration_seconds": memo.duration_seconds or transcription.duration_seconds,
            "language": memo.language or transcription.language,
            "filename": memo.filename,
            "mime_type": memo.mime_type,
            "context": memo.context,
        }
        return (
            "Extract structured metadata from this athlete voice memo transcript.\n\n"
            f"Context: {json.dumps(context, ensure_ascii=False)}\n\n"
            f"Transcript:\n{transcription.text.strip()}"
        )

    def _resolve_audio_input(self, memo: AudioMemoInput) -> tuple[bytes, str]:
        if memo.audio_bytes is not None:
            if not memo.audio_bytes:
                raise ValueError("audio_bytes cannot be empty")
            filename = memo.filename or "voice_memo.m4a"
            return memo.audio_bytes, filename

        if memo.audio_path:
            path = Path(memo.audio_path)
            if not path.exists():
                raise ValueError(f"Audio file not found: {memo.audio_path}")
            if not path.is_file():
                raise ValueError(f"Audio path is not a file: {memo.audio_path}")
            return path.read_bytes(), memo.filename or path.name

        raise ValueError("Either audio_bytes or audio_path is required")

    def _resolved_api_key(self) -> str:
        if not self.config.api_key:
            raise AudioServiceError("Missing OpenAI API key. Set OPENAI_API_KEY or LLM_API_KEY.")
        return self.config.api_key

    def _request_json(self, request: Request) -> dict[str, Any]:
        try:
            with urlopen(request, timeout=self.config.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise AudioServiceError(f"OpenAI request failed: {exc.code} {exc.reason}: {error_body}") from exc
        except URLError as exc:
            raise AudioServiceError(f"OpenAI request failed: {exc.reason}") from exc

        try:
            parsed = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise AudioServiceError("OpenAI returned invalid JSON") from exc

        if not isinstance(parsed, dict):
            raise AudioServiceError("OpenAI response was not a JSON object")

        return parsed

    @staticmethod
    def _build_multipart_payload(
        *,
        boundary: str,
        fields: dict[str, str],
        file_field: str,
        filename: str,
        content_type: str,
        file_bytes: bytes,
    ) -> bytes:
        body = bytearray()
        boundary_bytes = boundary.encode("utf-8")

        for key, value in fields.items():
            body.extend(b"--" + boundary_bytes + b"\r\n")
            body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"))
            body.extend(str(value).encode("utf-8"))
            body.extend(b"\r\n")

        body.extend(b"--" + boundary_bytes + b"\r\n")
        body.extend(
            f'Content-Disposition: form-data; name="{file_field}"; filename="{filename}"\r\n'.encode("utf-8")
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(file_bytes)
        body.extend(b"\r\n")
        body.extend(b"--" + boundary_bytes + b"--\r\n")
        return bytes(body)

    @staticmethod
    def _guess_mime_type(filename: str | None) -> str:
        if not filename:
            return "application/octet-stream"
        mime_type, _ = mimetypes.guess_type(filename)
        return mime_type or "application/octet-stream"

    @staticmethod
    def _parse_json_object(content: str) -> dict[str, Any]:
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AudioServiceError(f"LLM returned invalid JSON: {content}") from exc
        if not isinstance(parsed, dict):
            raise AudioServiceError("LLM response must be a JSON object")
        return parsed

    @staticmethod
    def _string_value(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, str):
            text = value.strip()
            return text or None
        return str(value)

    @classmethod
    def _string_list(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            result: list[str] = []
            for item in value:
                text = cls._string_value(item)
                if text:
                    result.append(text)
            return result
        text = cls._string_value(value)
        return [text] if text else []

    @staticmethod
    def _float_value(value: Any, default: float | None = None) -> float | None:
        if value in (None, ""):
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default

    @classmethod
    def _normalize_evidence(cls, value: Any) -> list[dict[str, str]]:
        if not isinstance(value, list):
            return []
        normalized: list[dict[str, str]] = []
        for item in value:
            if not isinstance(item, dict):
                continue
            claim = cls._string_value(item.get("claim"))
            snippet = cls._string_value(item.get("snippet"))
            if claim and snippet:
                normalized.append({"claim": claim, "snippet": snippet})
        return normalized

    @staticmethod
    def _dedupe_strings(values: list[str]) -> list[str]:
        seen: set[str] = set()
        result: list[str] = []
        for value in values:
            text = value.strip()
            if not text or text in seen:
                continue
            seen.add(text)
            result.append(text)
        return result

    @staticmethod
    def _word_count(text: str) -> int:
        return len(re.findall(r"\b\w+\b", text))

    @classmethod
    def _extract_keywords(cls, transcript: str, limit: int = 6) -> list[str]:
        if not transcript:
            return []
        candidates = re.findall(r"[a-zA-Z][a-zA-Z0-9-]+", transcript.lower())
        stopwords = {
            "a",
            "about",
            "again",
            "and",
            "are",
            "as",
            "at",
            "be",
            "been",
            "before",
            "but",
            "can",
            "for",
            "from",
            "have",
            "here",
            "how",
            "i",
            "if",
            "in",
            "is",
            "it",
            "just",
            "like",
            "me",
            "my",
            "of",
            "on",
            "or",
            "our",
            "out",
            "so",
            "that",
            "the",
            "their",
            "this",
            "to",
            "today",
            "we",
            "were",
            "with",
            "you",
        }
        counts: dict[str, int] = {}
        for token in candidates:
            if token in stopwords or len(token) < 3:
                continue
            counts[token] = counts.get(token, 0) + 1
        ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
        return [token for token, _count in ordered[:limit]]

    @classmethod
    def _collect_mentions(cls, transcript: str, phrases: list[str]) -> list[str]:
        lowered = transcript.lower()
        matches = [phrase for phrase in phrases if phrase in lowered]
        return matches

    @staticmethod
    def _first_matched_phrase(transcript: str, phrases: list[str]) -> str | None:
        lowered = transcript.lower()
        for phrase in phrases:
            if phrase in lowered:
                return phrase
        return None

    @staticmethod
    def _default_follow_up_questions(memo: AudioMemoInput, transcript: str) -> list[str]:
        questions: list[str] = []
        if memo.athlete_id:
            questions.append(f"What should be updated next for athlete {memo.athlete_id}?")
        else:
            questions.append("Which athlete does this memo belong to?")
        if not transcript:
            questions.append("Can the athlete resend the memo with clearer audio?")
        else:
            questions.append("Is there any follow-up detail that should be logged from this memo?")
        return questions


__all__ = [
    "AudioMemoInput",
    "AudioMemoMetadata",
    "AudioProcessingResult",
    "AudioService",
    "AudioServiceConfig",
    "AudioServiceError",
    "AudioTranscriptionResult",
]
