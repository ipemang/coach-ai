"""LLM client abstraction with provider switching via environment variables."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(slots=True)
class LLMConfig:
    provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "groq").strip().lower())
    model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "llama-3.1-70b-versatile").strip())
    temperature: float = field(default_factory=lambda: float(os.getenv("LLM_TEMPERATURE", "0.2")))
    max_tokens: int = field(default_factory=lambda: int(os.getenv("LLM_MAX_TOKENS", "4096")))
    timeout_seconds: float = field(default_factory=lambda: float(os.getenv("LLM_TIMEOUT_SECONDS", "60")))
    api_key: str | None = None
    base_url: str | None = field(default_factory=lambda: os.getenv("LLM_BASE_URL", "").strip() or None)

    def resolved_api_key(self) -> str:
        if self.api_key:
            return self.api_key
        if self.provider == "groq":
            return os.getenv("GROQ_API_KEY", os.getenv("LLM_API_KEY", "")).strip()
        if self.provider == "openai":
            return os.getenv("OPENAI_API_KEY", os.getenv("LLM_API_KEY", "")).strip()
        return os.getenv("LLM_API_KEY", "").strip()

    def resolved_base_url(self) -> str:
        if self.base_url:
            return self.base_url.rstrip("/")
        if self.provider == "groq":
            return os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
        if self.provider == "openai":
            return os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        return os.getenv("LLM_BASE_URL_FALLBACK", "https://api.openai.com/v1").rstrip("/")


class LLMClientError(RuntimeError):
    pass


class LLMClient:
    def __init__(self, config: LLMConfig | None = None) -> None:
        self.config = config or LLMConfig()

    def chat_completions(self, *, system: str, user: str) -> str:
        api_key = self.config.resolved_api_key()
        if not api_key:
            raise LLMClientError(
                f"Missing API key for provider '{self.config.provider}'. Set GROQ_API_KEY or OPENAI_API_KEY."
            )

        url = f"{self.config.resolved_base_url()}/chat/completions"
        payload = {
            "model": self.config.model,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
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

        try:
            with urlopen(request, timeout=self.config.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise LLMClientError(f"LLM request failed: {exc.code} {exc.reason}: {error_body}") from exc
        except URLError as exc:
            raise LLMClientError(f"LLM request failed: {exc.reason}") from exc

        try:
            data = json.loads(response_body)
        except json.JSONDecodeError as exc:
            raise LLMClientError("LLM returned invalid JSON") from exc

        choices = data.get("choices") or []
        if not choices:
            raise LLMClientError("LLM response did not contain any choices")

        message = choices[0].get("message") or {}
        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise LLMClientError("LLM response did not contain message content")

        return content


__all__ = ["LLMClient", "LLMClientError", "LLMConfig"]
