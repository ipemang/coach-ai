from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from math import exp, log
import re
from typing import Any

from app.services.scope import DataScope, apply_scope_query, require_scope


@dataclass(slots=True)
class AthleteMemorySearchResult:
    memory_state_id: str | None
    athlete_id: str | None
    athlete_name: str | None
    state_type: str | None
    updated_at: str | None
    score: float
    relevance_score: float
    recency_score: float
    context_score: float
    matched_terms: list[str] = field(default_factory=list)
    excerpt: str | None = None
    memory_state: dict[str, Any] = field(default_factory=dict)


class AthleteMemorySearchService:
    """Rank athlete memory rows for RAG-style retrieval."""

    def __init__(self, supabase_client: Any, memory_states_table: str = "memory_states", scope: DataScope | None = None) -> None:
        self.supabase_client = supabase_client
        self.memory_states_table = memory_states_table
        self.scope = scope

    async def search(
        self,
        query: str,
        *,
        athlete_id: str | None = None,
        limit: int = 5,
        state_types: list[str] | None = None,
        candidate_limit: int = 250,
        recency_half_life_days: float = 14.0,
        now: datetime | None = None,
    ) -> list[AthleteMemorySearchResult]:
        normalized_query = query.strip()
        if not normalized_query:
            return []

        query_tokens = _query_tokens(normalized_query)
        if not query_tokens:
            query_tokens = _tokenize(normalized_query)

        resolved_now = now or datetime.now(timezone.utc)
        rows = await self._fetch_candidates(
            athlete_id=athlete_id,
            state_types=state_types,
            candidate_limit=candidate_limit,
        )

        results: list[AthleteMemorySearchResult] = []
        for row in rows:
            scored = self._score_row(
                row,
                query=normalized_query,
                query_tokens=query_tokens,
                now=resolved_now,
                recency_half_life_days=recency_half_life_days,
            )
            if scored is not None:
                results.append(scored)

        results.sort(
            key=lambda item: (
                -item.score,
                -item.recency_score,
                -(item.updated_at is not None),
                item.updated_at or "",
                item.memory_state_id or "",
            )
        )
        return results[:limit]

    async def build_context(
        self,
        query: str,
        *,
        athlete_id: str | None = None,
        limit: int = 5,
        state_types: list[str] | None = None,
    ) -> tuple[list[AthleteMemorySearchResult], str]:
        results = await self.search(
            query,
            athlete_id=athlete_id,
            limit=limit,
            state_types=state_types,
        )
        context_lines: list[str] = []
        for index, item in enumerate(results, start=1):
            header_bits = [f"{index}."]
            if item.athlete_name:
                header_bits.append(item.athlete_name)
            if item.state_type:
                header_bits.append(f"[{item.state_type}]")
            if item.updated_at:
                header_bits.append(f"updated {item.updated_at}")
            header_bits.append(f"score={item.score:.1f}")
            context_lines.append(" ".join(header_bits))
            if item.matched_terms:
                context_lines.append(f"matched terms: {', '.join(item.matched_terms)}")
            if item.excerpt:
                context_lines.append(item.excerpt)
        return results, "\n".join(context_lines).strip()

    async def _fetch_candidates(
        self,
        *,
        athlete_id: str | None,
        state_types: list[str] | None,
        candidate_limit: int,
    ) -> list[dict[str, Any]]:
        scope = require_scope(self.scope, context="Athlete memory search")
        table = await self.supabase_client.table(self.memory_states_table)
        query = table.select("*") if hasattr(table, "select") else table
        query = apply_scope_query(query, scope)

        if athlete_id and hasattr(query, "eq"):
            query = query.eq("athlete_id", athlete_id)

        if state_types and hasattr(query, "in_"):
            query = query.in_("state_type", state_types)

        if hasattr(query, "order"):
            for column in ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day", "state_date"):
                try:
                    query = query.order(column, desc=True)
                    break
                except TypeError:
                    continue
                except Exception:
                    continue

        if hasattr(query, "limit"):
            try:
                query = query.limit(candidate_limit)
            except Exception:
                pass

        rows = await _query_rows(query)
        if not rows and hasattr(table, "select"):
            rows = await _query_rows(apply_scope_query(table.select("*"), scope))

        filtered: list[dict[str, Any]] = []
        for row in rows:
            row_athlete_id = _string_value(row.get("athlete_id") or row.get("athleteId") or row.get("user_id") or row.get("userId"))
            row_state_type = _string_value(row.get("state_type") or row.get("type") or row.get("category"))
            if athlete_id and row_athlete_id and row_athlete_id != athlete_id:
                continue
            if state_types and row_state_type not in state_types:
                continue
            filtered.append(row)

        return filtered[:candidate_limit]

    def _score_row(
        self,
        row: dict[str, Any],
        *,
        query: str,
        query_tokens: list[str],
        now: datetime,
        recency_half_life_days: float,
    ) -> AthleteMemorySearchResult | None:
        row_text = _normalize_text(_row_search_text(row))
        if not row_text:
            return None

        field_hits = _field_hits(row, query_tokens)
        matched_terms = sorted(set(field_hits["matched_terms"]))
        relevance_score = _compute_relevance_score(query, row_text, query_tokens, field_hits)
        recency_score = _compute_recency_score(row, now=now, half_life_days=recency_half_life_days)
        context_score = _compute_context_score(row, query_tokens)

        temporal_focus = _query_uses_recency(query)
        if temporal_focus:
            score = (0.42 * relevance_score) + (0.38 * recency_score) + (0.20 * context_score)
        else:
            score = (0.58 * relevance_score) + (0.27 * recency_score) + (0.15 * context_score)

        excerpt = _build_excerpt(row, query_tokens)

        return AthleteMemorySearchResult(
            memory_state_id=_string_value(row.get("id") or row.get("memory_state_id") or row.get("memoryStateId")),
            athlete_id=_string_value(row.get("athlete_id") or row.get("athleteId") or row.get("user_id") or row.get("userId")),
            athlete_name=_string_value(
                row.get("athlete_display_name")
                or row.get("athlete_name")
                or row.get("display_name")
                or row.get("name")
            ),
            state_type=_string_value(row.get("state_type") or row.get("type") or row.get("category")),
            updated_at=_row_updated_at(row),
            score=round(min(100.0, score), 2),
            relevance_score=round(min(100.0, relevance_score), 2),
            recency_score=round(min(100.0, recency_score), 2),
            context_score=round(min(100.0, context_score), 2),
            matched_terms=matched_terms,
            excerpt=excerpt,
            memory_state=_clean_row(row),
        )


def _query_uses_recency(query: str) -> bool:
    lowered = query.lower()
    return any(token in lowered for token in ("latest", "recent", "recently", "current", "today", "now", "update", "updated", "this week", "last"))


def _compute_relevance_score(query: str, row_text: str, query_tokens: list[str], field_hits: dict[str, Any]) -> float:
    if not query_tokens:
        return 0.0

    token_hits = field_hits["matched_terms"]
    coverage = len(set(token_hits)) / len(set(query_tokens))
    density = sum(1 for token in query_tokens if token in row_text) / len(query_tokens)
    exact_phrase = 1.0 if _normalize_text(query) in row_text else 0.0
    field_boost = min(1.0, float(field_hits["weighted_field_score"]) / 8.0)

    return (coverage * 55.0) + (density * 20.0) + (exact_phrase * 15.0) + (field_boost * 10.0)


def _compute_recency_score(row: dict[str, Any], *, now: datetime, half_life_days: float) -> float:
    timestamp = _row_datetime(row, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day", "state_date", "source_day"))
    if timestamp == datetime.min.replace(tzinfo=timezone.utc):
        return 18.0

    age_days = max(0.0, (now - timestamp).total_seconds() / 86400.0)
    half_life = max(1.0, half_life_days)
    return 100.0 * exp(-(log(2.0) * age_days) / half_life)


def _compute_context_score(row: dict[str, Any], query_tokens: list[str]) -> float:
    weighted_fields = (
        ("summary", 4.0),
        ("title", 4.0),
        ("headline", 3.5),
        ("note", 3.5),
        ("notes", 3.5),
        ("rationale", 3.5),
        ("suggestion_text", 3.0),
        ("description", 3.0),
        ("message", 2.5),
        ("payload", 2.5),
        ("plan_context", 2.5),
        ("metrics", 2.0),
        ("sections", 2.0),
        ("raw", 1.0),
    )

    query_set = set(query_tokens)
    if not query_set:
        return 0.0

    total_weight = 0.0
    total_score = 0.0
    for field_name, weight in weighted_fields:
        field_value = row.get(field_name)
        field_text = _normalize_text(_value_to_text(field_value))
        if not field_text:
            continue
        hits = sum(1 for token in query_set if token in field_text)
        if hits:
            total_weight += weight
            total_score += weight * (hits / len(query_set))

    if total_weight == 0.0:
        return 0.0
    return min(100.0, (total_score / total_weight) * 100.0)


def _field_hits(row: dict[str, Any], query_tokens: list[str]) -> dict[str, Any]:
    matched_terms: list[str] = []
    weighted_field_score = 0.0

    field_weights = (
        ("summary", 4.0),
        ("title", 4.0),
        ("headline", 3.5),
        ("note", 3.5),
        ("notes", 3.5),
        ("rationale", 3.5),
        ("suggestion_text", 3.0),
        ("description", 3.0),
        ("message", 2.5),
        ("payload", 2.5),
        ("plan_context", 2.5),
        ("metrics", 2.0),
        ("sections", 2.0),
        ("raw", 1.0),
    )

    for field_name, weight in field_weights:
        field_text = _normalize_text(_value_to_text(row.get(field_name)))
        if not field_text:
            continue
        hit_count = 0
        for token in query_tokens:
            if token in field_text:
                matched_terms.append(token)
                hit_count += 1
        if hit_count:
            weighted_field_score += weight * (hit_count / len(query_tokens))

    if not matched_terms:
        row_text = _normalize_text(_row_search_text(row))
        for token in query_tokens:
            if token in row_text:
                matched_terms.append(token)

    return {
        "matched_terms": matched_terms,
        "weighted_field_score": weighted_field_score,
    }


def _build_excerpt(row: dict[str, Any], query_tokens: list[str], max_length: int = 240) -> str | None:
    candidate_fields = (
        "summary",
        "title",
        "note",
        "notes",
        "rationale",
        "suggestion_text",
        "description",
        "message",
        "plan_context",
    )
    rows: list[str] = []
    for field_name in candidate_fields:
        value = _value_to_text(row.get(field_name))
        if value:
            rows.append(value)

    payload_text = _value_to_text(row.get("payload"))
    if payload_text:
        rows.append(payload_text)

    combined = _normalize_text(" | ".join(rows) or _row_search_text(row))
    if not combined:
        return None

    if query_tokens:
        positions = [combined.find(token) for token in query_tokens if combined.find(token) >= 0]
        if positions:
            start = max(0, min(positions) - 60)
            excerpt = combined[start : start + max_length]
            return _trim_excerpt(excerpt, max_length)

    return _trim_excerpt(combined[:max_length], max_length)


def _trim_excerpt(text: str, max_length: int) -> str:
    collapsed = " ".join(text.split())
    if len(collapsed) <= max_length:
        return collapsed
    return f"{collapsed[: max_length - 1].rstrip()}…"


def _row_search_text(row: dict[str, Any]) -> str:
    parts: list[str] = []
    for key in (
        "state_type",
        "type",
        "category",
        "summary",
        "title",
        "headline",
        "note",
        "notes",
        "message",
        "description",
        "rationale",
        "suggestion_text",
        "plan_context",
        "provider",
        "athlete_display_name",
        "athlete_name",
        "display_name",
        "name",
    ):
        value = _value_to_text(row.get(key))
        if value:
            parts.append(value)

    for key in ("payload", "metrics", "sections", "raw", "check_in", "memory_state", "details"):
        value = row.get(key)
        if value is not None:
            parts.append(_value_to_text(value))

    for key in ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day", "state_date", "source_day"):
        value = _value_to_text(row.get(key))
        if value:
            parts.append(value)

    return " \n ".join(part for part in parts if part)


def _value_to_text(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (datetime,)):
        return value.isoformat()
    if isinstance(value, dict):
        items: list[str] = []
        for key, nested_value in value.items():
            nested_text = _value_to_text(nested_value)
            if nested_text:
                items.append(f"{key}: {nested_text}")
        return " ; ".join(items)
    if isinstance(value, (list, tuple, set)):
        items: list[str] = []
        for item in value:
            item_text = _value_to_text(item)
            if item_text:
                items.append(item_text)
        return " ; ".join(items)
    return str(value)


def _normalize_text(value: str) -> str:
    return " ".join(value.lower().split())


def _query_tokens(query: str) -> list[str]:
    tokens = [token for token in re.findall(r"[a-z0-9']+", query.lower()) if token not in _STOPWORDS]
    return _dedupe(tokens)


def _tokenize(value: str) -> list[str]:
    return [token for token in re.findall(r"[a-z0-9']+", value.lower())]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        if value not in seen:
            seen.add(value)
            deduped.append(value)
    return deduped


async def _query_rows(query: Any) -> list[dict[str, Any]]:
    if hasattr(query, "execute"):
        response = await query.execute()
    elif hasattr(query, "__await__"):
        response = await query
    else:
        response = query
    return _extract_rows(response)


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
        if any(isinstance(value, (str, int, float, bool)) or value is None for value in response.values()):
            return [response]
        return []
    if hasattr(response, "data"):
        data = getattr(response, "data")
        if isinstance(data, list):
            return [row for row in data if isinstance(row, dict)]
        if isinstance(data, dict):
            return [data]
    return []


def _clean_row(row: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in row.items() if value is not None}


def _string_value(value: Any) -> str | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return str(value)


def _row_updated_at(row: dict[str, Any]) -> str | None:
    timestamp = _row_datetime(row, ("updated_at", "created_at", "recorded_at", "measured_at", "timestamp", "day", "state_date", "source_day"))
    if timestamp == datetime.min.replace(tzinfo=timezone.utc):
        return None
    return timestamp.isoformat()


def _row_datetime(row: dict[str, Any], keys: tuple[str, ...]) -> datetime:
    for key in keys:
        value = row.get(key)
        parsed = _parse_datetime(value)
        if parsed is not None:
            return parsed
    return datetime.min.replace(tzinfo=timezone.utc)


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


_STOPWORDS = {
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
    "get",
    "had",
    "has",
    "have",
    "how",
    "in",
    "is",
    "it",
    "latest",
    "more",
    "of",
    "on",
    "or",
    "recent",
    "recently",
    "that",
    "the",
    "their",
    "this",
    "to",
    "was",
    "what",
    "when",
    "which",
    "with",
    "would",
}


__all__ = ["AthleteMemorySearchResult", "AthleteMemorySearchService"]
