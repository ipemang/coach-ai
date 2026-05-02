from dataclasses import dataclass
from typing import Any


@dataclass
class AgentContext:
    athlete_id: str | None = None
    org_id: str | None = None
    metadata: dict[str, Any] | None = None


class BaseAgent:
    name: str = "base"

    def run(self, context: AgentContext) -> dict[str, Any]:
        return {
            "agent": self.name,
            "athlete_id": context.athlete_id,
            "org_id": context.org_id,
            "metadata": context.metadata or {},
        }
