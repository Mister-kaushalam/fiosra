.PHONY: help dev test lint db-up db-down db-seed db-dump db-restore clean

PG_CONTAINER ?= fiosra-postgres
PG_USER ?= postgres
PG_DB ?= fiosra_db
NEO4J_CONTAINER ?= fiosra-neo4j
NEO4J_USER ?= neo4j
NEO4J_PASS ?= fiosra_neo4j_password
DUMP_DIR ?= db_dumps
SNAPSHOT_TAR ?= $(DUMP_DIR)/fiosra_db_snapshot.tar.gz

help:
	@echo "Fiosra MVP Developer Commands:"
	@echo "  make dev        - Run FastAPI dev server with auto-reload"
	@echo "  make test       - Run full PyTest verification suite"
	@echo "  make db-up      - Start PostgreSQL 16 + pgvector and Neo4j containers"
	@echo "  make db-down    - Stop database containers"
	@echo "  make db-seed    - Seed baseline curriculum & misconceptions (via seed_pipeline)"
	@echo "  make db-dump    - Dump live PostgreSQL & Neo4j state into $(SNAPSHOT_TAR)"
	@echo "  make db-restore - Restore PostgreSQL & Neo4j from $(DUMP_DIR)/ or snapshot archive"
	@echo "  make lint       - Check code style with ruff"
	@echo "  make clean      - Remove python caches and build artifacts"

dev:
	uv run uvicorn fiosra.mvp.main:app --reload --port 8080

test:
	uv run pytest tests/ -v

db-up:
	docker compose up -d

db-down:
	docker compose down

seed:
	uv run python -m fiosra.mvp.seed_pipeline

db-seed: seed

db-dump:
	uv run python scripts/db_sync.py dump

db-restore:
	uv run python scripts/db_sync.py restore


lint:
	uv run ruff check fiosra/ tests/

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

