from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Protocol
import json
import re


class SupabaseClientProtocol(Protocol):
    async def table(self, name: str) -> Any:  # pragma: no cover - runtime adapter
        ...


STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "have",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "were",
    "with",
}


@dataclass(slots=True)
class AthleteMemorySearchHit:
    memory_state_id: str | None
    athlete_id: str
    state_type: str | None
    updated_at: str | None
    score: float
    summary: str
    snippet: str
    memory_state: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class AthleteMemorySearchResult:
    athlete_id: str
    query: str
    total_scanned: int
    used_fallback: bool
    matches: list[AthleteMemorySearchHit] = field(default_factory=list)


class AthleteMemorySearch:
    """Search athlete memory-state records with lightweight RAG-style ranking."""

    def __init__(self, supabase_client: SupabaseClientProtocol, memory_states_table: str = "memory_states") -> None:
        self.supabase_client = supabase_client
        self.memory_states_table = memory_states_table

    async def search(self, athlete_id: str, query: str | None, limit: int = 5) -> AthleteMemorySearchResult:
        rows = await self._list_rows(athlete_id)
        normalized_query = self._normalize_query(query)
        fallback = not normalized_query
        hits: list[AthleteMemorySearchHit] = []

        for row in rows:
            search_blob = self._row_search_blob(row)
            score = self._score_row(normalized_query, search_blob, row)
            if normalized_query and score <= 0:
                continue
            hits.append(
                AthleteMemorySearchHit(
                    memory_state_id=_string_value(row.get("id") or row.get("memory_state_id")),
                    athlete_id=_string_value(row.get("athlete_id") or athlete_id) or athlete_id,
                    state_type=_string_value(row.get("state_type") or row.get("type")),
                    updated_at=_iso_datetime(row.get("updated_at") or row.get("created_at") or row.get("recorded_at")),
                    score=score,
                    summary=self._build_summary(row),
                    snippet=self._build_snippet(search_blob, normalized_query),
                    memory_state=self._clean_row(row),
                )
            )

        if fallback:
            hits.sort(key=lambda item: (self._parse_datetime(item.updated_at) or datetime.min.replace(tzinfo=timezone.utc), item.score), reverse=True)
        else:
            hits.sort(key=lambda item: (item.score, self._parse_datetime(item.updated_at) or datetime.min.replace(tzinfo=timezone.utc)), reverse=True)

        return AthleteMemorySearchResult(
            athlete_id=athlete_id,
            query=query or "",
            total_scanned=len(rows),
            used_fallback=fallback,
            matches=hits[: max(1, limit)],
        )

    async def _list_rows(self, athlete_id: str) -> list[dict[str, Any]]:
        table = await self.supabase_client.table(self.memory_states_table)
        query = table.select("*") if hasattr(table, "select") else table
        if athlete_id and hasattr(query, "eq"):
            query = query.eq("athlete_id", athlete_id)
        response = await _execute(query)
        return _extract_rows(response)

    @staticmethod
    def _normalize_query(query: str | None) -> list[str]:
        if not query:
            return []
        tokens = re.findall(r"[a-z0-9]+", query.lower())
        return [token for token in tokens if token not in STOPWORDS]

    def _score_row(self, query_tokens: list[str], search_blob: str, row: dict[str, Any]) -> float:
        if not query_tokens:
            return self._recency_score(row)

        lowered = search_blob.lower()
        overlap = sum(1 for token in query_tokens if token in lowered)
        if overlap == 0:
            return 0.0

        token_score = (overlap / len(query_tokens)) * 70.0
        recency_score = self._recency_score(row) * 0.3
        state_type = _string_value(row.get("state_type") or row.get("type") or "") or ""
        state_bonus = 8.0 if any(token in state_type.lower() for token in query_tokens) else 0.0
        return round(token_score + recency_score + state_bonus, 2)

    def _recency_score(self, row: dict[str, Any]) -> float:
        dt = self._parse_datetime(row.get("updated_at") or row.get("created_at") or row.get("recorded_at"))
        if dt is None:
            return 0.0
        age_hours = max(0.0, (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0)
        return max(0.0, 30.0 - min(30.0, age_hours / 24.0 * 2.0))

    def _build_summary(self, row: dict[str, Any]) -> str:
        for key in ("summary", "title", "note", "message", "rationale"):
            value = row.get(key)
            text = _string_value(value)
            if text:
                return text

        payload = row.get("payload") or row.get("memory_state") or row.get("check_in") or row.get("details")
        if isinstance(payload, dict):
            for key in ("summary", "title", "note", "message", "rationale"):
                text = _string_value(payload.get(key))
                if text:
                    return text

        blob = self._row_search_blob(row)
        return blob[:160] if blob else ""

    def _build_snippet(self, search_blob: str, query_tokens: list[str]) -> str:
        if not search_blob:
            return ""
        if not query_tokens:
            return search_blob[:240]

        lowered = search_blob.lower()
        for token in query_tokens:
            idx = lowered.find(token)
            if idx >= 0:
                start = max(0, idx - 80)
                end = min(len(search_blob), idx + 160)
                return search_blob[start:end].strip()
        return search_blob[:240]

    def _row_search_blob(self, row: dict[str, Any]) -> str:
        parts: list[str] = []
        for key in (
            "summary",
            "title",
            "note",
            "message",
            "rationale",
            "state_type",
            "updated_at",
            "created_at",
            "recorded_at",
        ):
            value = row.get(key)
            if value is not None:
                parts.append(self._stringify(value))
        for key in ("payload", "memory_state", "check_in", "details", "methodology_playbook"):
            value = row.get(key)
            if value is not None:
                parts.append(self._stringify(value))
        return " \n".join(part for part in parts if part).strip()

    def _clean_row(self, row: dict[str, Any]) -> dict[str, Any]:
        return {key: value for key, value in row.items() if value is not None}

    @staticmethod
    def _stringify(value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, (datetime,)):
            return value.isoformat()
        if isinstance(value, (dict, list, tuple, set)):
            try:
                return json.dumps(value, ensure_ascii=False, default=str)
            except TypeError:
                return str(value)
        return str(value)

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)
        try:
            parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)


async def _execute(query: Any) -> Any:
    if hasattr(query, "execute"):
        result = query.execute()
        if hasattr(result, "__await__"):
            return await result
        return result
    if hasattr(query, "__await__"):
        return await query
    return query


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


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _iso_datetime(value: Any) -> str | None:
    parsed = AthleteMemorySearch._parse_datetime(value)
    return parsed.isoformat() if parsed else None


__all__ = [
    "AthleteMemorySearch",
    "AthleteMemorySearchHit",
    "AthleteMemorySearchResult",
]
