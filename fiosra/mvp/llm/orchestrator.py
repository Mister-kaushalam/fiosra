import hashlib
import logging
import re
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fiosra.mvp.config import settings
from fiosra.mvp.llm.contracts import CompletionRequest, LLMProviderError
from fiosra.mvp.llm.litellm_provider import LiteLLMProvider


class LLMServiceUnavailableError(LLMProviderError):
    """Raised when an operation requires a live LLM connection, but none is available or the provider call failed."""
    pass


logger = logging.getLogger(__name__)

ANSWER_LEAK_PATTERNS = re.compile(
    r"(?:answer\s*key|reference\s*solution|vault[_\s-]*token|bottom[- ]?out\s*(?:answer|solution))",
    re.IGNORECASE,
)
SOLUTION_STYLE_PATTERNS = re.compile(
    r"(?:\*\*(?:student task|claim|evidence|direct observation|inference|thesis|answer|solution)\*\*\s*:|"
    r"(?:^|\s)(?:student task|claim|evidence|direct observation|inference|thesis|answer|solution)\s*:|"
    r"(?:^|\s)\d+\.\s|\b(?:the report|the source)\s+(?:mentions|states|notes|shows)\b)",
    re.IGNORECASE,
)
ASSIGNMENT_DIRECTIVE_PATTERN = re.compile(
    r"^(?:analyze|assess|compare|consider|construct|develop|determine|evaluate|examine|"
    r"explain|formulate|identify|investigate|use|using|write)\b",
    re.IGNORECASE,
)
WHITESPACE = re.compile(r"\s+")
WORD_PATTERN = re.compile(r"[a-z]+(?:'[a-z]+)?", re.IGNORECASE)
PROBE_REPHRASE_FUNCTION_WORDS = frozenset(
    {
        "a", "an", "and", "are", "as", "at", "be", "before", "by", "can", "could", "does",
        "for", "from", "how", "in", "is", "it", "of", "on", "or", "should", "that", "the",
        "this", "to", "what", "which", "why", "with", "would", "you", "your",
    }
)


@dataclass(frozen=True)
class GenerationMetadata:
    """Auditable, prompt-free metadata for a generation attempt."""

    provider: str
    model: str
    used_live_provider: bool
    latency_ms: int | None = None
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None
    fallback_reason: str | None = None

    def as_dict(self) -> dict[str, object]:
        return {
            "provider": self.provider,
            "model": self.model,
            "used_live_provider": self.used_live_provider,
            "latency_ms": self.latency_ms,
            "prompt_tokens": self.prompt_tokens,
            "completion_tokens": self.completion_tokens,
            "total_tokens": self.total_tokens,
            "fallback_reason": self.fallback_reason,
        }


@dataclass(frozen=True)
class GuardedGeneration:
    """A response that has passed boundary and output validation."""

    content: str
    metadata: GenerationMetadata


class LLMOrchestrator:
    """Safely enhance deterministic Fiosra copy without delegating product authority.

    All callers resolve learning context, permitted hint rung, and deterministic fallback
    before calling this service. The provider never receives answers, vault tokens, student
    identifiers, or complete event histories.
    """

    _failure_count: int = 0
    _cooldown_until: datetime | None = None

    @staticmethod
    def _pseudonymous_user(seed: str) -> str:
        """Return a stable opaque ID accepted by provider abuse controls."""
        return f"fiosra-{hashlib.sha256(seed.encode()).hexdigest()[:20]}"

    @staticmethod
    def _clean_candidate(content: str, max_characters: int, purpose: str) -> str:
        cleaned = WHITESPACE.sub(" ", content).strip()
        if not cleaned:
            raise LLMProviderError("Provider returned empty text after normalization.")
        if len(cleaned) > max_characters:
            raise LLMProviderError("Provider response exceeded the configured safety limit.")
        if ANSWER_LEAK_PATTERNS.search(cleaned):
            raise LLMProviderError("Provider response contained prohibited answer-isolation language.")
        if purpose == "assignment_scaffold_prompt" and SOLUTION_STYLE_PATTERNS.search(cleaned):
            raise LLMProviderError("Provider response resembled a worked answer instead of a student task.")
        if purpose == "assignment_scaffold_prompt" and not ASSIGNMENT_DIRECTIVE_PATTERN.search(cleaned):
            raise LLMProviderError("Provider response did not preserve student-task imperative form.")
        if purpose in {"socratic_hint_rephrase", "socratic_probe_rephrase"}:
            if not cleaned.endswith("?") or cleaned.count("?") != 1:
                raise LLMProviderError("Provider response did not preserve one-question Socratic form.")
            if purpose == "socratic_probe_rephrase" and re.search(
                r"\b(?:the answer is|you should conclude|your thesis is|the source proves)\b",
                cleaned,
                re.IGNORECASE,
            ):
                raise LLMProviderError("Provider response attempted to disclose a conclusion instead of a probe.")
        elif purpose == "socratic_dialogue_turn":
            if "?" not in cleaned:
                raise LLMProviderError("Provider response did not include a Socratic inquiry question.")
            if re.search(
                r"\b(?:the answer is|the correct option is|you should conclude that)\b",
                cleaned,
                re.IGNORECASE,
            ):
                raise LLMProviderError("Provider response leaked a direct conclusion.")
        return cleaned

    @staticmethod
    def _validate_probe_rephrase_vocabulary(content: str, allowed_context: str) -> None:
        """Reject provider-invented facts in an otherwise question-shaped probe."""
        allowed_words = set(WORD_PATTERN.findall(allowed_context.lower())) | PROBE_REPHRASE_FUNCTION_WORDS
        candidate_words = set(WORD_PATTERN.findall(content.lower()))
        invented_words = candidate_words - allowed_words
        if invented_words:
            raise LLMProviderError("Provider response introduced vocabulary outside the bounded probe context.")

    @classmethod
    def _is_in_cooldown(cls) -> bool:
        return bool(cls._cooldown_until and datetime.now(UTC) < cls._cooldown_until)

    @classmethod
    def _record_failure(cls, reason: str) -> None:
        cls._failure_count += 1
        if cls._failure_count >= settings.FIOSRA_LLM_FAILURES_BEFORE_COOLDOWN:
            cls._cooldown_until = datetime.now(UTC) + timedelta(
                seconds=settings.FIOSRA_LLM_COOLDOWN_SECONDS
            )
        logger.warning("LLM enhancement fell back to deterministic copy: %s", reason)

    @classmethod
    def _record_success(cls) -> None:
        cls._failure_count = 0
        cls._cooldown_until = None

    @classmethod
    def reset_for_testing(cls) -> None:
        """Reset process-local reliability state between isolated tests."""
        cls._failure_count = 0
        cls._cooldown_until = None

    async def enhance(
        self,
        *,
        purpose: str,
        system_prompt: str,
        user_prompt: str,
        deterministic_fallback: str = "",
        pseudonymous_seed: str,
        max_characters: int,
        max_tokens: int,
        allow_live: bool = True,
        require_live: bool = False,
        request_timeout_seconds: float | None = None,
        response_format: dict[str, object] | None = None,
    ) -> GuardedGeneration:
        """Return a validated live response or raise/fall back based on require_live.

        When require_live is True, this method fails transparently with LLMServiceUnavailableError
        instead of returning synthetic deterministic text.
        """
        configured_provider = settings.FIOSRA_LLM_PROVIDER.strip().lower()
        if configured_provider == "deterministic":
            if require_live:
                raise LLMServiceUnavailableError(
                    "Socratic dialogue service is unavailable: live LLM provider is not configured."
                )
            return GuardedGeneration(
                content=deterministic_fallback,
                metadata=GenerationMetadata(
                    provider="deterministic",
                    model="deterministic",
                    used_live_provider=False,
                ),
            )
        if not allow_live:
            if require_live:
                raise LLMServiceUnavailableError("Live LLM generation is disallowed for this request.")
            return GuardedGeneration(
                content=deterministic_fallback,
                metadata=GenerationMetadata(
                    provider="deterministic",
                    model="deterministic",
                    used_live_provider=False,
                    fallback_reason="requires_course_grounding",
                ),
            )
        if self._is_in_cooldown():
            if require_live:
                raise LLMServiceUnavailableError(
                    f"LLM provider is temporarily in cooldown until {self._cooldown_until}."
                )
            return GuardedGeneration(
                content=deterministic_fallback,
                metadata=GenerationMetadata(
                    provider="deterministic",
                    model="deterministic",
                    used_live_provider=False,
                    fallback_reason="provider_cooldown",
                ),
            )

        started_at = time.perf_counter()
        try:
            provider = LiteLLMProvider.from_settings()
            result = await provider.complete(
                CompletionRequest(
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    purpose=purpose,
                    max_tokens=max_tokens,
                    timeout_seconds=request_timeout_seconds,
                    response_format=response_format,
                    metadata={"user": self._pseudonymous_user(pseudonymous_seed)},
                )
            )
            content = self._clean_candidate(result.content, max_characters, purpose)
            if purpose == "socratic_probe_rephrase":
                self._validate_probe_rephrase_vocabulary(content, user_prompt)
            self._record_success()
            return GuardedGeneration(
                content=content,
                metadata=GenerationMetadata(
                    provider=result.provider,
                    model=result.model,
                    used_live_provider=True,
                    latency_ms=result.latency_ms,
                    prompt_tokens=result.prompt_tokens,
                    completion_tokens=result.completion_tokens,
                    total_tokens=result.total_tokens,
                ),
            )
        except (LLMProviderError, TimeoutError) as exc:
            reason = str(exc)[:160]
        except Exception as exc:  # noqa: BLE001 # pragma: no cover - protective final boundary
            reason = f"unexpected_provider_error:{type(exc).__name__}"

        self._record_failure(reason)
        if require_live:
            raise LLMServiceUnavailableError(f"Socratic dialogue service unavailable: {reason}")
        return GuardedGeneration(
            content=deterministic_fallback,
            metadata=GenerationMetadata(
                provider="deterministic",
                model="deterministic",
                used_live_provider=False,
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                fallback_reason=reason,
            ),
        )


llm_orchestrator = LLMOrchestrator()
