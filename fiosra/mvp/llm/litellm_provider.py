import asyncio
import time
from typing import Any

from fiosra.mvp.config import settings
from fiosra.mvp.llm.contracts import CompletionRequest, CompletionResult, LLMProviderError


class LiteLLMProvider:
    """LiteLLM adapter supporting OpenRouter, OpenAI, Gemini, and Ollama model strings."""

    def __init__(self, provider_name: str, model: str, api_key: str | None, api_base: str | None):
        self.provider_name = provider_name
        self.model = model
        self.api_key = api_key
        self.api_base = api_base

    @classmethod
    def from_settings(cls) -> "LiteLLMProvider":
        provider = settings.FIOSRA_LLM_PROVIDER.strip().lower()
        if provider == "openrouter":
            model = settings.OPENROUTER_MODEL
            api_key = settings.OPENROUTER_API_KEY
            api_base = settings.OPENROUTER_API_BASE
        elif provider == "openai":
            model = settings.OPENAI_MODEL
            api_key = settings.OPENAI_API_KEY
            api_base = settings.OPENAI_API_BASE
        elif provider == "gemini":
            model = settings.GEMINI_MODEL
            api_key = settings.GEMINI_API_KEY
            api_base = None
        elif provider == "ollama":
            model = settings.OLLAMA_MODEL
            api_key = None
            api_base = settings.OLLAMA_API_BASE
        else:
            raise LLMProviderError(f"Unsupported FIOSRA_LLM_PROVIDER '{provider}'.")

        if provider != "ollama" and not api_key:
            raise LLMProviderError(f"No API key is configured for the '{provider}' provider.")
        if not model:
            raise LLMProviderError(f"No model is configured for the '{provider}' provider.")
        return cls(provider_name=provider, model=model, api_key=api_key, api_base=api_base)

    @staticmethod
    def _usage_value(usage: Any, name: str) -> int | None:
        if not usage:
            return None
        value = usage.get(name) if isinstance(usage, dict) else getattr(usage, name, None)
        return int(value) if isinstance(value, int | float) else None

    async def complete(self, request: CompletionRequest) -> CompletionResult:
        """Execute LiteLLM asynchronously and normalize only provider metadata and text."""
        try:
            from litellm import acompletion
        except ImportError as exc:  # pragma: no cover - dependency is declared in pyproject
            raise LLMProviderError("LiteLLM is not installed.") from exc

        timeout_by_provider = {
            "ollama": settings.OLLAMA_TIMEOUT_SECONDS,
            "openrouter": settings.OPENROUTER_TIMEOUT_SECONDS,
            "openai": settings.OPENAI_TIMEOUT_SECONDS,
        }
        timeout_seconds = request.timeout_seconds or timeout_by_provider.get(
            self.provider_name,
            settings.OPENROUTER_TIMEOUT_SECONDS,
        )
        call_options: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
            "timeout": timeout_seconds,
            "num_retries": 0,
        }
        # GPT-5 models reject the legacy max_tokens/temperature combination.
        # Other LiteLLM providers retain the OpenAI-compatible defaults.
        if self.provider_name == "openai" and self.model.startswith("gpt-5"):
            call_options["max_completion_tokens"] = request.max_tokens
            call_options["reasoning_effort"] = "minimal"
        else:
            call_options["temperature"] = request.temperature
            call_options["max_tokens"] = request.max_tokens
        if self.api_key:
            call_options["api_key"] = self.api_key
        if self.api_base:
            call_options["api_base"] = self.api_base
            call_options["base_url"] = self.api_base
        # LiteLLM maps this OpenAI-compatible field to supported providers and preserves
        # privacy by using an opaque, per-session pseudonym supplied by the caller.
        if request.metadata.get("user"):
            call_options["user"] = request.metadata["user"]
        if request.response_format:
            call_options["response_format"] = request.response_format
        if self.provider_name == "openrouter":
            call_options["extra_body"] = {"reasoning": {"effort": "none"}}

        started_at = time.perf_counter()
        try:
            response = await asyncio.wait_for(
                acompletion(**call_options),
                timeout=timeout_seconds,
            )
        except Exception as exc:
            raise LLMProviderError(
                f"{self.provider_name} completion failed: {type(exc).__name__}"
            ) from exc

        choices = getattr(response, "choices", None) or []
        message = choices[0].message if choices else None
        content = getattr(message, "content", None) if message else None
        if not isinstance(content, str) or not content.strip():
            raise LLMProviderError("Provider returned an empty completion.")

        usage = getattr(response, "usage", None)
        response_model = getattr(response, "model", None)
        return CompletionResult(
            content=content.strip(),
            provider=self.provider_name,
            model=response_model or self.model,
            latency_ms=round((time.perf_counter() - started_at) * 1000),
            prompt_tokens=self._usage_value(usage, "prompt_tokens"),
            completion_tokens=self._usage_value(usage, "completion_tokens"),
            total_tokens=self._usage_value(usage, "total_tokens"),
        )
