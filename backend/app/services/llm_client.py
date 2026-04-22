"""LLM client abstraction with provider switching via environment variables.

COA-71: chat_completions now returns an LLMResponse dataclass that includes
token usage alongside the content string. All existing callers that do
`result = client.chat_completions(...)` and use `result` as a string will
break — use `result.content` instead. A `chat` alias is provided for brevity.
"""

from __future__ import annotations

import json
import os
import time

from app.core.config import get_settings
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
            settings = get_settings()
            return (settings.groq_api_key or os.getenv("GROQ_API_KEY", os.getenv("LLM_API_KEY", ""))).strip()
        if self.provider == "openai":
            settings = get_settings()
            return (settings.openai_api_key or os.getenv("OPENAI_API_KEY", os.getenv("LLM_API_KEY", ""))).strip()
        return os.getenv("LLM_API_KEY", "").strip()

    def resolved_base_url(self) -> str:
        if self.base_url:
            return self.base_url.rstrip("/")
        if self.provider == "groq":
            return os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1").rstrip("/")
        if self.provider == "openai":
            return os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        return os.getenv("LLM_BASE_URL_FALLBACK", "https://api.openai.com/v1").rstrip("/")


@dataclass(slots=True)
class LLMResponse:
    """Returned by every LLMClient call.

    Attributes:
        content:       The model's text output.
        input_tokens:  Prompt token count (from API usage field).
        output_tokens: Completion token count.
        model:         Model name echo'd from the response (or config fallback).
        latency_ms:    Wall-clock time for the HTTP round-trip in milliseconds.
    """
    content: str
    input_tokens: int
    output_tokens: int
    model: str
    latency_ms: int

    @property
    def total_tokens(self) -> int:
        return self.input_tokens + self.output_tokens


@dataclass(slots=True)
class EmbedResponse:
    """Returned by LLMClient.embed().

    Attributes:
        embeddings:   Parallel list of 1536-dim embedding vectors.
        total_tokens: Total tokens consumed across all batches (from API usage field).
        model:        Embedding model name used.
    """
    embeddings: list[list[float]]
    total_tokens: int
    model: str = "text-embedding-3-small"


class LLMClientError(RuntimeError):
    pass


class LLMClient:
    def __init__(self, config: LLMConfig | None = None) -> None:
        self.config = config or LLMConfig()

    def chat_completions(
        self,
        *,
        system: str,
        user: str,
        image_urls: list[str] | None = None,
    ) -> LLMResponse:
        """Call the LLM and return an LLMResponse with content + token counts.

        Pass image_urls to use the vision API (OpenAI-compatible multimodal format).
        Max 4 images recommended for cost control.

        Raises LLMClientError on any failure.
        """
        api_key = self.config.resolved_api_key()
        if not api_key:
            raise LLMClientError(
                f"Missing API key for provider '{self.config.provider}'. "
                "Set GROQ_API_KEY or OPENAI_API_KEY (or LLM_API_KEY)."
            )

        # Build user content — plain text or multimodal (text + images)
        if image_urls:
            user_content: str | list = [{"type": "text", "text": user}] + [
                {"type": "image_url", "image_url": {"url": url, "detail": "high"}}
                for url in image_urls[:4]  # hard cap at 4 frames
            ]
            # Vision requires a model that supports it; default to gpt-4o for OpenAI
            vision_model = os.getenv("VISION_MODEL", "gpt-4o" if self.config.provider == "openai" else self.config.model)
        else:
            user_content = user
            vision_model = self.config.model

        url = f"{self.config.resolved_base_url()}/chat/completions"
        payload = {
            "model": vision_model,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
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

        t0 = time.monotonic()
        try:
            with urlopen(request, timeout=self.config.timeout_seconds) as response:
                response_body = response.read().decode("utf-8")
        except HTTPError as exc:
            error_body = exc.read().decode("utf-8", errors="replace")
            raise LLMClientError(
                f"LLM request failed: {exc.code} {exc.reason}: {error_body}"
            ) from exc
        except URLError as exc:
            raise LLMClientError(f"LLM request failed: {exc.reason}") from exc
        finally:
            latency_ms = int((time.monotonic() - t0) * 1000)

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

        # Extract token counts — present in all OpenAI-compatible APIs
        usage = data.get("usage") or {}
        input_tokens = int(usage.get("prompt_tokens", 0))
        output_tokens = int(usage.get("completion_tokens", 0))
        model_echo = data.get("model", self.config.model)

        return LLMResponse(
            content=content,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=model_echo,
            latency_ms=latency_ms,
        )

    def embed(self, texts: list[str]) -> EmbedResponse:
        """Embed a list of texts using OpenAI text-embedding-3-small (1536 dims).

        Always uses OpenAI regardless of LLM_PROVIDER — Groq has no embedding API.
        Batches up to 100 texts per call. Returns EmbedResponse with embeddings + token count.

        Raises LLMClientError on failure.
        """
        if not texts:
            return EmbedResponse(embeddings=[], total_tokens=0)

        import os as _os
        api_key = (_os.getenv("OPENAI_API_KEY") or _os.getenv("LLM_API_KEY", "")).strip()
        if not api_key:
            raise LLMClientError("Missing OPENAI_API_KEY — required for embeddings")

        base_url = _os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
        model = _os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
        results: list[list[float]] = []
        total_tokens = 0

        # Process in batches of 100
        for i in range(0, len(texts), 100):
            batch = texts[i : i + 100]
            payload = {"model": model, "input": batch}
            request = Request(
                f"{base_url}/embeddings",
                data=json.dumps(payload).encode("utf-8"),
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                method="POST",
            )
            try:
                with urlopen(request, timeout=30.0) as response:
                    data = json.loads(response.read().decode("utf-8"))
            except HTTPError as exc:
                err = exc.read().decode("utf-8", errors="replace")
                raise LLMClientError(f"Embedding request failed: {exc.code}: {err}") from exc
            except URLError as exc:
                raise LLMClientError(f"Embedding request failed: {exc.reason}") from exc

            usage = data.get("usage") or {}
            total_tokens += int(usage.get("total_tokens", 0))
            items = sorted(data.get("data", []), key=lambda x: x["index"])
            results.extend(item["embedding"] for item in items)

        return EmbedResponse(embeddings=results, total_tokens=total_tokens, model=model)

    # Convenience alias
    chat = chat_completions


__all__ = ["LLMClient", "LLMClientError", "LLMConfig", "LLMResponse", "EmbedResponse"]
