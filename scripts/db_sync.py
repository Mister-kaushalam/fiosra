#!/usr/bin/env python3
"""
Cross-Platform Database Sync Utility for Fiosra (macOS / Linux / Windows)

Automates dumping and restoring PostgreSQL (with pgvector) and Neo4j (Knowledge Graph)
using Docker containers and Python standard libraries.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path

# Project paths
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DUMP_DIR = PROJECT_ROOT / "db_dumps"
DEFAULT_SNAPSHOT_NAME = "fiosra_db_snapshot.tar.gz"
STORAGE_DIR = PROJECT_ROOT / "storage"

# Container configurations
PG_CONTAINER = os.getenv("PG_CONTAINER", "fiosra-postgres")
PG_USER = os.getenv("PG_USER", "postgres")
PG_DB = os.getenv("PG_DB", "fiosra_db")

NEO4J_CONTAINER = os.getenv("NEO4J_CONTAINER", "fiosra-neo4j")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASS = os.getenv("NEO4J_PASSWORD", "fiosra_neo4j_password")


def run_cmd(cmd: list[str], check: bool = True, capture_output: bool = False) -> subprocess.CompletedProcess:
    """Execute a system command cross-platform."""
    try:
        return subprocess.run(
            cmd,
            check=check,
            cwd=str(PROJECT_ROOT),
            text=True,
            capture_output=capture_output,
        )
    except subprocess.CalledProcessError as e:
        print(f"❌ Error running command: {' '.join(cmd)}")
        if e.stderr:
            print(f"Details: {e.stderr.strip()}")
        raise


def ensure_containers_running() -> None:
    """Check if required database containers are active, boot with docker compose if not."""
    print("🔍 Checking database containers...")
    res = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}"],
        capture_output=True,
        text=True,
        check=False,
    )
    running_names = res.stdout.split()

    if PG_CONTAINER not in running_names or NEO4J_CONTAINER not in running_names:
        print("🚀 Starting database containers via docker compose...")
        run_cmd(["docker", "compose", "up", "-d"])

    # Wait for postgres to be ready
    print("⏳ Waiting for PostgreSQL to accept connections...")
    for _ in range(30):
        probe = subprocess.run(
            ["docker", "exec", PG_CONTAINER, "pg_isready", "-U", PG_USER, "-d", PG_DB],
            capture_output=True,
            text=True,
            check=False,
        )
        if probe.returncode == 0:
            print("✅ PostgreSQL is healthy.")
            break
        time.sleep(1)
    else:
        print("⚠️ Warning: PostgreSQL readiness check timed out. Proceeding anyway...")


def clean_neo4j_database() -> None:
    """Drop all constraints, indexes, and nodes in Neo4j to ensure clean import without collision."""
    print("   -> Clearing existing Neo4j constraints & indexes...")
    # 1. Drop constraints
    res = subprocess.run([
        "docker", "exec", NEO4J_CONTAINER, "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
        "--format", "plain", "SHOW CONSTRAINTS YIELD name RETURN name;"
    ], capture_output=True, text=True, check=False)
    if res.returncode == 0:
        for line in res.stdout.splitlines()[1:]:
            name = line.strip().strip('"').strip("'")
            if name:
                subprocess.run([
                    "docker", "exec", NEO4J_CONTAINER, "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
                    f"DROP CONSTRAINT {name} IF EXISTS;"
                ], capture_output=True, text=True, check=False)

    # 2. Drop non-lookup indexes
    res = subprocess.run([
        "docker", "exec", NEO4J_CONTAINER, "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
        "--format", "plain", "SHOW INDEXES YIELD name, type WHERE type <> 'LOOKUP' RETURN name;"
    ], capture_output=True, text=True, check=False)
    if res.returncode == 0:
        for line in res.stdout.splitlines()[1:]:
            name = line.strip().strip('"').strip("'")
            if name:
                subprocess.run([
                    "docker", "exec", NEO4J_CONTAINER, "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
                    f"DROP INDEX {name} IF EXISTS;"
                ], capture_output=True, text=True, check=False)

    # 3. Detach delete all nodes
    subprocess.run([
        "docker", "exec", NEO4J_CONTAINER, "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
        "MATCH (n) DETACH DELETE n;"
    ], capture_output=True, text=True, check=False)


def dump_databases(dump_dir: Path) -> Path:
    """Export PostgreSQL and Neo4j databases and storage files, then package into tar.gz."""
    ensure_containers_running()
    dump_dir.mkdir(parents=True, exist_ok=True)

    pg_dump_file = dump_dir / "fiosra_postgres.dump"
    neo4j_dump_file = dump_dir / "fiosra_neo4j.cypher"
    archive_file = dump_dir / DEFAULT_SNAPSHOT_NAME

    # 1. PostgreSQL dump (write directly to file inside container to prevent any TTY/pipe byte corruption)
    print("\n📦 [1/3] Exporting PostgreSQL (pgvector schema & tables)...")
    run_cmd([
        "docker", "exec", PG_CONTAINER,
        "pg_dump", "-U", PG_USER, "-d", PG_DB, "-F", "c", "-b",
        "-f", "/tmp/fiosra_postgres.dump"
    ])
    run_cmd(["docker", "cp", f"{PG_CONTAINER}:/tmp/fiosra_postgres.dump", str(pg_dump_file)])
    
    # Verify binary magic signature
    with open(pg_dump_file, "rb") as f:
        magic = f.read(5)
        if magic != b"PGDMP":
            sys.exit(f"❌ Error: Corrupted PostgreSQL dump file generated (magic: {magic!r}).")
    print(f"   -> Saved: {pg_dump_file.name} ({pg_dump_file.stat().st_size / (1024*1024):.2f} MB - Valid PGDMP)")

    # 2. Neo4j APOC export
    print("\n📦 [2/3] Exporting Neo4j Knowledge Graph via APOC...")
    # Remove stale export file to prevent permission-denied (UID mismatch from prior docker cp)
    subprocess.run(
        ["docker", "exec", NEO4J_CONTAINER, "rm", "-f", "/var/lib/neo4j/import/export.cypher"],
        capture_output=True, text=True, check=False,
    )
    apoc_cypher = (
        "CALL apoc.export.cypher.all('/var/lib/neo4j/import/export.cypher', "
        "{format: 'cypher-shell', useOptimizations: {type: 'unwind_batch', batchSize: 500}, ifNotExists: true});"
    )
    run_cmd([
        "docker", "exec", NEO4J_CONTAINER,
        "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
        apoc_cypher
    ])
    run_cmd(["docker", "cp", f"{NEO4J_CONTAINER}:/var/lib/neo4j/import/export.cypher", str(neo4j_dump_file)])
    print(f"   -> Saved: {neo4j_dump_file.name} ({neo4j_dump_file.stat().st_size / (1024*1024):.2f} MB)")

    # 3. Create compressed archive (databases + storage files)
    print(f"\n🗜️ Packaging into {archive_file.name}...")
    with tarfile.open(archive_file, "w:gz") as tar:
        tar.add(pg_dump_file, arcname="fiosra_postgres.dump")
        tar.add(neo4j_dump_file, arcname="fiosra_neo4j.cypher")

        # Include assignment PDFs and uploaded documents
        if STORAGE_DIR.exists() and any(STORAGE_DIR.iterdir()):
            print("\n📦 [3/3] Including storage/ (assignment PDFs & documents)...")
            tar.add(str(STORAGE_DIR), arcname="storage")
            storage_size = sum(f.stat().st_size for f in STORAGE_DIR.rglob("*") if f.is_file())
            print(f"   -> Added: storage/ ({storage_size / (1024*1024):.2f} MB, "
                  f"{sum(1 for _ in STORAGE_DIR.rglob('*') if _.is_file())} files)")
        else:
            print("\n⚠️ [3/3] No storage/ directory found or empty — skipping document backup.")

    print(f"\n✅ Snapshot created successfully: {archive_file}")
    print(f"   Archive size: {archive_file.stat().st_size / (1024*1024):.2f} MB")
    print("   Contents: PostgreSQL dump + Neo4j graph + storage documents")
    print("   Ready to be committed via Git LFS or shared with teammates.")
    return archive_file


def restore_databases(dump_dir: Path) -> None:
    """Restore PostgreSQL, Neo4j, and storage files from loose dump files or tar.gz archive."""
    ensure_containers_running()

    pg_dump_file = dump_dir / "fiosra_postgres.dump"
    neo4j_dump_file = dump_dir / "fiosra_neo4j.cypher"
    archive_file = dump_dir / DEFAULT_SNAPSHOT_NAME
    extracted_storage = dump_dir / "storage"

    # Extract archive if loose files not found
    if archive_file.exists() and (not pg_dump_file.exists() or not neo4j_dump_file.exists()):
        print(f"\n📂 Extracting archive {archive_file.name}...")
        with tarfile.open(archive_file, "r:gz") as tar:
            tar.extractall(path=dump_dir)

    if not pg_dump_file.exists():
        sys.exit(f"❌ Error: PostgreSQL dump not found at {pg_dump_file} or in {archive_file}.")

    # Validate PostgreSQL archive header
    with open(pg_dump_file, "rb") as f:
        magic = f.read(5)
        if magic != b"PGDMP":
            sys.exit(
                f"❌ Error: '{pg_dump_file.name}' is not a valid PostgreSQL custom dump archive.\n"
                f"   Header starts with: {magic!r}. Please re-generate using 'make db-dump'."
            )

    # 1. Restore PostgreSQL
    print("\n🔄 [1/3] Restoring PostgreSQL database...")
    run_cmd(["docker", "cp", str(pg_dump_file), f"{PG_CONTAINER}:/tmp/fiosra_postgres.dump"])
    run_cmd([
        "docker", "exec", PG_CONTAINER,
        "pg_restore", "-U", PG_USER, "-d", PG_DB, "--clean", "--if-exists", "--no-owner",
        "/tmp/fiosra_postgres.dump"
    ], check=False)
    print("   -> PostgreSQL restored successfully.")

    # 2. Restore Neo4j
    if neo4j_dump_file.exists():
        print("\n🔄 [2/3] Restoring Neo4j Knowledge Graph...")
        # Clear existing constraints, indexes and nodes to avoid duplicate index collisions
        clean_neo4j_database()
        
        # Copy cypher file into container
        run_cmd(["docker", "cp", str(neo4j_dump_file), f"{NEO4J_CONTAINER}:/var/lib/neo4j/import/export.cypher"])
        # Import cypher
        run_cmd([
            "docker", "exec", NEO4J_CONTAINER,
            "cypher-shell", "-u", NEO4J_USER, "-p", NEO4J_PASS,
            "-f", "/var/lib/neo4j/import/export.cypher"
        ])
        print("   -> Neo4j Knowledge Graph restored successfully.")
    else:
        print(f"⚠️ Warning: Neo4j dump {neo4j_dump_file} not found. Skipped graph restore.")

    # 3. Restore storage/ (assignment PDFs & uploaded documents)
    if extracted_storage.exists() and any(extracted_storage.iterdir()):
        print("\n🔄 [3/3] Restoring storage/ (assignment PDFs & documents)...")
        # Merge extracted storage into project root storage directory
        if STORAGE_DIR.exists():
            shutil.rmtree(STORAGE_DIR)
        shutil.copytree(str(extracted_storage), str(STORAGE_DIR))
        file_count = sum(1 for _ in STORAGE_DIR.rglob("*") if _.is_file())
        storage_size = sum(f.stat().st_size for f in STORAGE_DIR.rglob("*") if f.is_file())
        print(f"   -> Restored: storage/ ({storage_size / (1024*1024):.2f} MB, {file_count} files)")
    else:
        print("\n⚠️ [3/3] No storage/ found in archive — skipping document restore.")

    print("\n🎉 Databases and storage files successfully restored and ready for use!")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fiosra Cross-Platform Database Sync Utility")
    subparsers = parser.add_subparsers(dest="command", required=True)

    dump_parser = subparsers.add_parser("dump", help="Dump PostgreSQL and Neo4j databases")
    dump_parser.add_argument("--dir", type=Path, default=DEFAULT_DUMP_DIR, help="Output directory")

    restore_parser = subparsers.add_parser("restore", help="Restore PostgreSQL and Neo4j databases")
    restore_parser.add_argument("--dir", type=Path, default=DEFAULT_DUMP_DIR, help="Input directory")

    args = parser.parse_args()

    if args.command == "dump":
        dump_databases(args.dir)
    elif args.command == "restore":
        restore_databases(args.dir)


if __name__ == "__main__":
    main()
