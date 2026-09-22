# Fiosra: Reasoning Infrastructure Layer for Education

> **Fiosra** is a reasoning infrastructure layer for education.
> It helps educators design environments where thinking can be developed and gives students the space and support to demonstrate that thinking, while creating a student-owned record of learning over time.

---

## 📚 Comprehensive Developer Guide

For detailed architectural specifications, service breakdowns, entity-relationship diagrams, Svelte 5 component guides, and API contracts, refer to the **[Developer Guide](docs/developer-guide/README.md)**:

- [**Chapter 1: System Architecture & Philosophy**](docs/developer-guide/01-system-architecture.md) — 4 Core Invariants, Answer Isolation, and Sequence Workflows.
- [**Chapter 2: Backend Services & Storage Architecture**](docs/developer-guide/02-backend-services.md) — FastAPI, 6 Reasoning Engines, Neo4j & PostgreSQL Schemas.
- [**Chapter 3: Frontend Architecture (Svelte 5 SPA)**](docs/developer-guide/03-frontend-architecture.md) — Svelte 5 Runes, Hash Routing, Design Tokens, & Component Library.
- [**Chapter 4: Comprehensive API Reference**](docs/developer-guide/04-api-reference.md) — Complete REST Route Contracts & Request/Response Payloads.
- [**Chapter 5: Developer Workflows & Operations**](docs/developer-guide/05-development-workflows.md) — Local Dev, Docker Stack, Pytest Suite, & Svelte Build.

---

## 🚀 Quickstart for Developers

### 1. Prerequisites
- Python 3.11+
- Docker & Docker Compose (for PostgreSQL 16 + pgvector)

### 2. Environment Setup
```bash
# Clone and enter directory
cd tutor

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template
cp .env.example .env
```

### 3. Start Database (PostgreSQL 16 with pgvector)
```bash
make db-up
# Or: docker compose up -d
```
The database boots on port `5432` and automatically initializes the database tables and pgvector extension via `fiosra/mvp/migrations/001_initial_schema.sql`.

### 4. Run FastAPI Backend
```bash
make dev
# Or: uvicorn fiosra.mvp.app:app --reload --port 8000
```
Open interactive OpenAPI documentation in your browser at:
👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

### 5. Run Verification Tests
```bash
make test
# Or: pytest fiosra/tests/ -v
```

---

## 🏛️ Repository Directory Map

```
tutor/
├── fiosra/
│   ├── README.md                    # Detailed MVP Architecture Specification
│   ├── docs/                        # MVP visual architecture interactive docs (.html, .pdf)
│   ├── data/schemas/                # JSON schemas (transaction logs, rubrics, evidence)
│   ├── knowledge/seeds/             # Foundational misconception and KC seed catalogs
│   │
│   ├── mvp/                         # FastAPI Application & 6 Modular Core Services
│   │   ├── app.py                   # Central FastAPI app mounting all 6 routers
│   │   ├── config.py                # Environment & Pydantic application settings
│   │   ├── database.py              # Async SQLAlchemy session and connection pool
│   │   ├── migrations/              # SQL DDL & database migrations
│   │   │
│   │   ├── assignment_designer/     # Component 1: Syllabus RAG & distractor generator
│   │   ├── policy_engine/           # Component 2: Pedagogical policy & SymPy Answer Vault
│   │   ├── socratic_tutor/          # Component 3: Answer-blind conversational guide
│   │   ├── knowledge_layer/         # Component 4: NetworkX DAG & pgvector misconception store
│   │   ├── event_store/             # Component 5: Append-only student event flight recorder
│   │   └── evidence_dossier/        # Component 6: AutoSCORE light dossier synthesis
│   │
│   ├── tests/                       # PyTest verification suite
│   │
│   └── reference/                   # Long-Term Research & Theoretical Reference
│       ├── README.md                # Research index
│       ├── README_MASTER_VISION.md  # Full theoretical framework (hyperbolic geometry, Kafka, etc.)
│       └── agents/                  # Full 6-agent research specifications
│
├── frontend/                        # Svelte 5 SPA Frontend Client
├── docs/                            # Documentation & Architecture Specifications
│   └── design/                      # UI/UX Specifications (Student, Teacher, LMS)
├── docker-compose.yml               # PostgreSQL 16 + pgvector container
├── requirements.txt                 # Backend Python dependencies
├── Makefile                         # Developer CLI commands
└── CONTRIBUTING.md                  # Development guidelines & architectural invariants
```

---

## 📚 Architectural Tenets
Every contributor must adhere to these four core rules:
1. **Answer Isolation**: The student-facing agent (`socratic_tutor`) has zero access to reference solutions. Only the `policy_engine` (Answer Vault) verifies answers.
2. **Deterministic Outranks Probabilistic**: SymPy CAS and exact unit tests always override LLM predictions.
3. **Non-Manipulable Hint Ceilings**: Hint level advancement is computed deterministically from attempt counts and prior mastery, not student prompt manipulation.
4. **Structured Evidence ($Z$)**: Capturing student struggle as typed JSON logs rather than lossy summary embeddings.
