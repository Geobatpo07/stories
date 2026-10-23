"""Export the validated LadybugDB graph into `knowledge.duckdb`, in exactly today's shape.

Contract source: build/targets/duckdb-target.ts. Two tables, column names, order and types as
there, NO primary key and NO NOT NULL, DROP-then-CREATE on a fresh file. The two DDL strings below
are copied verbatim from that file; backend/tests/test_artifact_contract.py parses the TypeScript
and fails if they drift.

The optional search-index tables (see search_index.py) are additive: the adapter reads only the two
base tables.
"""

import hashlib
import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import duckdb

from .graph_store import GraphStore
from .search_index import (
    SEARCH_DDL,
    SEARCH_RELATED_COLUMNS,
    SEARCH_STATS_COLUMNS,
    compute_search_signals,
)

DROP_STATEMENTS = (
    "DROP TABLE IF EXISTS knowledge_relationship;",
    "DROP TABLE IF EXISTS knowledge_entity;",
)
CREATE_ENTITY = (
    "CREATE TABLE knowledge_entity (id VARCHAR, kind VARCHAR, slug VARCHAR, title VARCHAR, summary VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR, content VARCHAR, file_path VARCHAR, metadata JSON);"
)
CREATE_RELATIONSHIP = (
    "CREATE TABLE knowledge_relationship (source_id VARCHAR, target_id VARCHAR, field VARCHAR, cardinality VARCHAR);"
)
ENTITY_COLUMNS = (
    ("id", "VARCHAR"), ("kind", "VARCHAR"), ("slug", "VARCHAR"), ("title", "VARCHAR"),
    ("summary", "VARCHAR"), ("status", "VARCHAR"), ("created_at", "VARCHAR"),
    ("updated_at", "VARCHAR"), ("content", "VARCHAR"), ("file_path", "VARCHAR"),
    ("metadata", "VARCHAR"),  # JSON text, cast to the JSON column type on insert
)
RELATIONSHIP_COLUMNS = (
    ("source_id", "VARCHAR"), ("target_id", "VARCHAR"), ("field", "VARCHAR"), ("cardinality", "VARCHAR"),
)


def insert_rows(
    connection: duckdb.DuckDBPyConnection,
    table: str,
    columns: Sequence[tuple[str, str]],
    rows: Sequence[Sequence[Any]],
    casts: dict[str, str] | None = None,
) -> None:
    """Insert every row with ONE statement and ONE bound parameter (a JSON document).

    Why not `executemany` or one `?` per value: the DuckDB Python client probes optional modules
    (numpy, pandas, ...) for every bound value, and with those absent each probe is a failed import
    that walks sys.path. Measured: ~24,000 `_find_and_load` calls and ~9 s for a 100-entity build,
    growing linearly (a 1000-entity build took ~63 s). Passing the rows as a single JSON string and
    unpacking them in SQL costs one conversion regardless of size and adds no dependency. Row order
    is preserved by `unnest`.
    """
    if not rows:
        return
    names = [name for name, _ in columns]
    document = json.dumps(
        [dict(zip(names, row, strict=True)) for row in rows], ensure_ascii=False, allow_nan=False
    )
    structure = json.dumps([dict(columns)])
    casts = casts or {}
    select = ", ".join(f"r.{name}::{casts[name]}" if name in casts else f"r.{name}" for name in names)
    connection.execute(
        f"INSERT INTO {table} SELECT {select} FROM "
        f"(SELECT unnest(json_transform(CAST(? AS JSON), '{structure}')) AS r);",
        [document],
    )


def write_knowledge_database(
    store: GraphStore, database_path: Path, *, include_search_index: bool
) -> tuple[str, dict[str, int]]:
    """Write the file and return `(sha256 of its bytes, row counts)`."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    for stale in (database_path, database_path.with_name(database_path.name + ".wal")):
        stale.unlink(missing_ok=True)  # a build is a full regeneration of a disposable file

    entities = store.entity_rows()
    relationships = store.relationship_rows()
    counts = {"knowledgeEntity": len(entities), "knowledgeRelationship": len(relationships)}

    connection = duckdb.connect(str(database_path))
    try:
        for statement in DROP_STATEMENTS:
            connection.execute(statement)
        connection.execute(CREATE_ENTITY)
        connection.execute(CREATE_RELATIONSHIP)
        insert_rows(connection, "knowledge_entity", ENTITY_COLUMNS, entities, {"metadata": "JSON"})
        insert_rows(connection, "knowledge_relationship", RELATIONSHIP_COLUMNS, relationships)

        if include_search_index:
            related, stats = compute_search_signals(store)
            for statement in SEARCH_DDL:
                connection.execute(statement)
            insert_rows(connection, "knowledge_search_related", SEARCH_RELATED_COLUMNS, related)
            insert_rows(connection, "knowledge_search_stats", SEARCH_STATS_COLUMNS, stats)
            counts["knowledgeSearchRelated"] = len(related)
            counts["knowledgeSearchStats"] = len(stats)

        connection.execute("CHECKPOINT;")
    finally:
        connection.close()

    return hashlib.sha256(database_path.read_bytes()).hexdigest(), counts
