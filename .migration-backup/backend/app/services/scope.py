from __future__ import annotations

from dataclasses import dataclass
from os import getenv
from typing import Any


@dataclass
class DataScope:
    organization_id: str | None = None
    coach_id: str | None = None

    def is_configured(self) -> bool:
        return bool(self.organization_id or self.coach_id)


def resolve_scope_from_env() -> DataScope:
    organization_id = _first_non_empty(
        getenv("COACH_ORGANIZATION_ID"),
        getenv("ORGANIZATION_ID"),
    )
    coach_id = _first_non_empty(getenv("COACH_ID"), getenv("COACH_COACH_ID"))
    return DataScope(organization_id=organization_id, coach_id=coach_id)


def apply_scope_query(query: Any, scope: DataScope | None) -> Any:
    if query is None or scope is None:
        return query

    scoped_query = query
    for field_name, value in _scope_filters(scope):
        if value and hasattr(scoped_query, "eq"):
            scoped_query = scoped_query.eq(field_name, value)
    return scoped_query


def apply_scope_payload(payload: dict[str, Any], scope: DataScope | None) -> dict[str, Any]:
    if scope is None:
        return dict(payload)

    scoped_payload = dict(payload)
    if scope.organization_id:
        scoped_payload.setdefault("organization_id", scope.organization_id)
    if scope.coach_id:
        scoped_payload.setdefault("coach_id", scope.coach_id)
    return scoped_payload


def require_scope(scope: DataScope | None, *, context: str) -> DataScope:
    if scope is None or not scope.is_configured():
        raise ValueError(f"{context} requires organization_id or coach_id scope")
    return scope


def _scope_filters(scope: DataScope) -> tuple[tuple[str, str], ...]:
    filters: list[tuple[str, str]] = []
    if scope.organization_id:
        filters.append(("organization_id", scope.organization_id))
    if scope.coach_id:
        filters.append(("coach_id", scope.coach_id))
    return tuple(filters)


def _first_non_empty(*values: str | None) -> str | None:
    for value in values:
        if value is not None and str(value).strip():
            return str(value).strip()
    return None
