# Fiosra Developer Guide

Welcome to the comprehensive developer documentation for **Fiosra** — the pedagogical reasoning infrastructure layer designed to scaffold critical thinking in education.

---

## 🧭 Master Guide Navigation

This developer guide is organized into six modular chapters covering the entire system from high-level theoretical tenets to line-by-line API contracts and local development pipelines:

| Chapter | Title | Focus & Contents |
| :--- | :--- | :--- |
| [**Chapter 1**](./01-system-architecture.md) | **System Architecture & Philosophy** | Core architectural tenets, Answer Isolation, CAS verification, deterministic hint ceilings, $Z$-trace, system flow diagrams. |
| [**Chapter 2**](./02-backend-services.md) | **Backend Services & Storage** | FastAPI core, 6 reasoning engines, LMS and course portfolio, PostgreSQL 16 + pgvector, Neo4j graph schemas, and SQL migrations. |
| [**Chapter 3**](./03-frontend-architecture.md) | **Frontend Architecture (Svelte 5 SPA)** | Svelte 5 runes (`$state`, `$derived`, `$props`), hash-based SPA router (`/ui/#/`), Educator Studio views, Student Workspace, reusable component library, and design tokens. |
| [**Chapter 4**](./04-api-reference.md) | **Comprehensive API Reference** | Complete REST endpoint specifications, request/response schemas, path/query parameters, status codes, and JSON payloads. |
| [**Chapter 5**](./05-development-workflows.md) | **Developer Workflows & Operations** | Prerequisites, local development environment, Docker Compose stack, test execution (`pytest`), Vite production build, database migrations, and debugging. |
| [**Chapter 6**](./06-learning-canvas-and-assistance.md) | **Long-Form Documents & Socratic Evidence** | Tiptap/ProseMirror writer-first documents, protected block persistence, proactive paragraph questions, evaluator-visible evidence, session capabilities, and the safeguarded assistance roadmap. |
| [**Taxonomy Reference**](../taxonomy/README.md) | **Unified Curriculum & Pedagogical Taxonomy** | Full 4-tier pedagogical ontology, High-to-Low concepts (`course_theme` $\to$ `strand` $\to$ `topic` $\to$ `atomic_concept`), Bloom levels, Socratic inquiry rungs, source grounding, and Cypher schemas. |

---

## 🏛️ High-Level Technology Stack

```
                                 CLIENT LAYER
                     [ Svelte 5 + Vite 8 + CSS Design System ]
                     Single Page App (Hash Router at /ui/#/)
                                      │
                                      ▼  REST / JSON
                               APPLICATION LAYER
                        [ FastAPI + Python 3.11+ / 3.14 ]
           ┌──────────────────────────┼──────────────────────────┐
           ▼                          ▼                          ▼
   Reasoning Engines           LMS & Portfolio           Socratic Dialogue
 (Designer, Policy, AutoSCORE) (Courses, Modules)     (Answer-Blind Scaffold)
           │                          │                          │
           └──────────────────────────┼──────────────────────────┘
                                      ▼
                                STORAGE LAYER
        ┌─────────────────────────────┴─────────────────────────────┐
        ▼                                                           ▼
 [ PostgreSQL 16 + pgvector ]                                  [ Neo4j 5 ]
  • Courses, Modules, Resources                                 • Knowledge Components (KCs)
  • Append-Only Event Store ($Z$)                              • Misconceptions & DAG Edges
  • Syllabus Vector Embeddings                                  • Prerequisite Dependencies
```

### Key Technologies
- **Backend**: Python 3.11+, [FastAPI](https://fastapi.tiangolo.com/), [SQLAlchemy](https://www.sqlalchemy.org/) (Async engine), [Pydantic v2](https://docs.pydantic.dev/), [SymPy](https://www.sympy.org/) Computer Algebra System, [NetworkX](https://networkx.org/).
- **Frontend**: [Svelte 5](https://svelte.dev/) (Modern Runes syntax), [Vite 8](https://vitejs.dev/), [svelte-spa-router](https://github.com/ItalyPaleAle/svelte-spa-router), [Tiptap/ProseMirror](https://tiptap.dev/) for long-form student documents, and a custom Glassmorphic Design System (Vanilla CSS).
- **Databases**: [PostgreSQL 16](https://www.postgresql.org/) with [`pgvector`](https://github.com/pgvector/pgvector) extension, [Neo4j Community 5](https://neo4j.com/).
- **DevOps & Testing**: [Docker & Docker Compose](https://www.docker.com/), [uv](https://docs.astral.sh/uv/), [pytest](https://docs.pytest.org/) (76 passing tests in the current local validation suite), [Ruff](https://docs.astral.sh/ruff/).

---

## ⚡ 60-Second Quickstart

```bash
# 1. Clone repository and set up Python environment
cd tutor
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# 2. Boot PostgreSQL + pgvector and Neo4j via Docker
docker compose up -d

# 3. Build Svelte frontend
cd frontend && npm install && npm run build && cd ..

# 4. Launch FastAPI server
uvicorn fiosra.mvp.main:app --reload --port 8000
```

- 🌐 **Web Client**: [http://localhost:8000/ui/#/courses](http://localhost:8000/ui/#/courses)
- 📖 **Interactive OpenAPI Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- 🧪 **Run Test Suite**: `uv run pytest`

---

## 🔒 Four Non-Negotiable Invariants

Every engineer contributing to Fiosra must preserve four core tenets:

1. **Answer Isolation**: The student-facing dialogue engine has zero visibility into correct solutions. Solutions reside exclusively inside the Answer Vault.
2. **Deterministic Outranks Probabilistic**: SymPy CAS and exact unit tests always supersede LLM outputs.
3. **Non-Manipulable Hint Ceilings**: Hint level progression is strictly computed from telemetry and attempt counts, never prompt injection.
4. **Structured Evidence Trace ($Z$)**: Epistemic struggle is captured as typed JSON event logs rather than lossy summary embeddings.
5. **Learner-Owned Socratic Evidence**: Proactive questions may test stable learner writing, but never interrupt composition, author prose, issue automatic grades, or treat an unanswered question as misconduct.
