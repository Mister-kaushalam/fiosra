
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "Fiosra Reasoning Infrastructure"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"
    SECRET_KEY: str = "change-this-in-production-secret-token-key"

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # PostgreSQL Connection String (asyncpg)
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/fiosra_db"

    # Neo4j 5 Connection Settings
    NEO4J_URI: str = "bolt://localhost:7687"
    NEO4J_USER: str = "neo4j"
    NEO4J_PASSWORD: str = "fiosra_neo4j_password"


    # Live language-model provider. "deterministic" is deliberately the default so
    # the core teaching workflow works with no external service or secret.
    FIOSRA_LLM_PROVIDER: str = "deterministic"
    FIOSRA_LLM_FAILURES_BEFORE_COOLDOWN: int = 3
    FIOSRA_LLM_COOLDOWN_SECONDS: int = 60
    FIOSRA_PROBE_QUIET_SECONDS: int = 5
    FIOSRA_PROBE_MIN_MATERIAL_CHARACTERS: int = 100
    FIOSRA_PROBE_SESSION_BUDGET: int = 6
    FIOSRA_PROBE_COOLDOWN_SECONDS: int = 90

    # LiteLLM provider configuration. Model strings include the LiteLLM provider
    # prefix where required, allowing the application to switch without code changes.
    OPENROUTER_API_KEY: str | None = None
    OPENROUTER_API_BASE: str = "https://openrouter.ai/api/v1"
    OPENROUTER_MODEL: str = "openrouter/nvidia/nemotron-3-ultra-550b-a55b:free"
    OPENAI_API_KEY: str | None = None
    OPENAI_API_BASE: str | None = None
    # Nano is appropriate for brief, structured, answer-blind writing help.
    # It can be promoted per environment without changing application code.
    OPENAI_MODEL: str = "gpt-4.1-nano"
    OPENAI_TIMEOUT_SECONDS: float = 30.0
    GEMINI_API_KEY: str | None = None
    GEMINI_MODEL: str = "gemini/gemini-3.6-flash"
    OLLAMA_API_BASE: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "ollama/llama3.2"
    # Local models can take longer than hosted providers to generate a complete
    # structured draft, so they receive an independent timeout budget.
    OLLAMA_TIMEOUT_SECONDS: float = 150.0
    # Free OpenRouter routes can queue before generation begins, so authoring
    # requests need more than the short default used by interactive probes.
    OPENROUTER_TIMEOUT_SECONDS: float = 90.0
    ANTHROPIC_API_KEY: str | None = None

    # Verifiers & Scaffolding
    ENABLE_MATH_CAS: bool = True
    ENABLE_NLI_VERIFIER: bool = False
    DEFAULT_MAX_HINT_LEVEL: int = 3
    CORS_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
