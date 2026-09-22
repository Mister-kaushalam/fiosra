# ==============================================================================
# FIOSRA FULL-STACK DOCKERFILE
# Multi-stage build: Svelte 5 Frontend + FastAPI Python Backend
# ==============================================================================

# Stage 1: Build Svelte Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app

COPY frontend/package*.json ./frontend/
RUN cd frontend && npm install

COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# Stage 2: Python Backend Runtime
FROM python:3.12-slim AS runner
WORKDIR /app

# Install curl for container healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv package manager
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Install python dependencies using uv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy application source code
COPY fiosra/ ./fiosra/
COPY --from=frontend-builder /app/frontend/dist/ ./frontend/dist/

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app"
ENV DATABASE_URL="postgresql+asyncpg://postgres:postgres@postgres:5432/fiosra_db"
ENV NEO4J_URI="bolt://neo4j:7687"
ENV NEO4J_USER="neo4j"
ENV NEO4J_PASSWORD="fiosra_neo4j_password"

EXPOSE 8000

HEALTHCHECK --interval=5s --timeout=5s --retries=5 \
    CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "fiosra.mvp.main:app", "--host", "0.0.0.0", "--port", "8000"]
