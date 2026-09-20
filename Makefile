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
	@mkdir -p $(DUMP_DIR)
	@echo "==> [1/2] Dumping PostgreSQL (pgvector schema + data)..."
	docker exec -t $(PG_CONTAINER) pg_dump -U $(PG_USER) -d $(PG_DB) -F c -b -v > $(DUMP_DIR)/fiosra_postgres.dump
	@echo "==> [2/2] Dumping Neo4j Knowledge Graph via APOC..."
	docker exec $(NEO4J_CONTAINER) cypher-shell -u $(NEO4J_USER) -p $(NEO4J_PASS) \
		"CALL apoc.export.cypher.all('/var/lib/neo4j/import/export.cypher', {format: 'cypher-shell', useOptimizations: {type: 'unwind_batch', batchSize: 500}});"
	docker cp $(NEO4J_CONTAINER):/var/lib/neo4j/import/export.cypher $(DUMP_DIR)/fiosra_neo4j.cypher
	@echo "==> Packaging archive into $(SNAPSHOT_TAR)..."
	tar -czvf $(SNAPSHOT_TAR) -C $(DUMP_DIR) fiosra_postgres.dump fiosra_neo4j.cypher
	@echo "\n✅ Successfully dumped databases to $(DUMP_DIR)/"
	@echo "   Share '$(SNAPSHOT_TAR)' with your teammates."

db-restore:
	@if [ -f "$(SNAPSHOT_TAR)" ] && [ ! -f "$(DUMP_DIR)/fiosra_postgres.dump" ]; then \
		echo "==> Extracting $(SNAPSHOT_TAR)..."; \
		tar -xzvf $(SNAPSHOT_TAR) -C $(DUMP_DIR); \
	fi
	@if [ ! -f "$(DUMP_DIR)/fiosra_postgres.dump" ]; then \
		echo "❌ Error: $(DUMP_DIR)/fiosra_postgres.dump not found."; \
		echo "   Ensure you have $(SNAPSHOT_TAR) or dump files inside $(DUMP_DIR)/"; \
		exit 1; \
	fi
	@echo "==> [1/2] Restoring PostgreSQL database..."
	cat $(DUMP_DIR)/fiosra_postgres.dump | docker exec -i $(PG_CONTAINER) pg_restore -U $(PG_USER) -d $(PG_DB) --clean --if-exists --no-owner
	@if [ -f "$(DUMP_DIR)/fiosra_neo4j.cypher" ]; then \
		echo "==> [2/2] Restoring Neo4j Knowledge Graph..."; \
		docker exec $(NEO4J_CONTAINER) cypher-shell -u $(NEO4J_USER) -p $(NEO4J_PASS) "MATCH (n) DETACH DELETE n;" ; \
		docker exec -i $(NEO4J_CONTAINER) cypher-shell -u $(NEO4J_USER) -p $(NEO4J_PASS) < $(DUMP_DIR)/fiosra_neo4j.cypher ; \
	fi
	@echo "\n✅ Successfully restored PostgreSQL and Neo4j databases from $(DUMP_DIR)/"

lint:
	uv run ruff check fiosra/ tests/

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

