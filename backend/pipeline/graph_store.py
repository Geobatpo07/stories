"""LadybugDB working graph: the Python build pipeline's first stage (ADR-004).

Loads Kernel-validated entities and already-resolved relationships as nodes and edges, answers
getParents / getChildren / getRelated as Cypher, and feeds the DuckDB export and the search index.
The graph is a disposable working copy rebuilt every run; the generated artifact stays DuckDB.

Ordering contract: Cypher has no implicit ordering, so every read here has an explicit `ORDER BY`
on top of which the callers that need byte-exact output re-sort with `byte_key` (UTF-8 byte order,
the collation DuckDB's `ORDER BY` uses by default and the one `ArtifactKnowledgeSourceAdapter` reads
with). LadybugDB's own string ordering was observed to be byte order for ASCII; `byte_key` removes
any dependence on that for non-ASCII ids.
"""

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

import ladybug as lb

from kernel.errors import KnowledgeRelationshipError
from kernel.types import KnowledgeEntity

from .errors import DuplicateEntityError


def byte_key(value: str) -> bytes:
    """The pinned collation for every sort in the pipeline: UTF-8 byte order."""
    return value.encode("utf-8")


def metadata_json(metadata: dict[str, Any]) -> str:
    """Same text as JavaScript's `JSON.stringify(entity.metadata)`: compact, raw non-ASCII."""
    return json.dumps(metadata, separators=(",", ":"), ensure_ascii=False)


class GraphStore:
    def __init__(self, path: Path | None = None) -> None:
        """`path=None` keeps the graph in memory (the default for builds)."""
        self._db = lb.Database(":memory:" if path is None else str(path))
        self._conn = lb.Connection(self._db)
        self._conn.execute(
            "CREATE NODE TABLE Entity(id STRING PRIMARY KEY, kind STRING, slug STRING, title STRING,"
            " summary STRING, status STRING, created_at STRING, updated_at STRING, content STRING,"
            " file_path STRING, metadata STRING)"
        )
        self._conn.execute(
            "CREATE REL TABLE Rel(FROM Entity TO Entity, field STRING, cardinality STRING)"
        )
        self._loaded = False

    # ---- load ---------------------------------------------------------------------------

    def load(self, entities: Sequence[KnowledgeEntity]) -> None:
        """Nodes then edges, in one pass over the entities, validating as it goes.

        - A repeated id raises `DuplicateEntityError` naming both source files; nothing past the
          collision is loaded.
        - An edge whose target is not a loaded node raises `KnowledgeRelationshipError`. This is
          checked explicitly because `MATCH ... CREATE` against a missing node silently creates
          nothing. (`kernel.resolve_relationships` already guarantees it for `content/` input; this
          also protects entity lists that arrive another way.)
        """
        if self._loaded:
            raise RuntimeError("GraphStore.load() may only be called once per store")
        first_path: dict[str, str] = {}
        rows: list[dict[str, Any]] = []
        for entity in entities:
            if entity.id in first_path:
                raise DuplicateEntityError(entity.id, first_path[entity.id], entity.file_path)
            first_path[entity.id] = entity.file_path
            rows.append(
                {
                    "id": entity.id,
                    "kind": entity.kind,
                    "slug": entity.slug,
                    "title": entity.title,
                    "summary": entity.summary,
                    "status": entity.status,
                    "created_at": entity.created_at,
                    "updated_at": entity.updated_at,
                    "content": entity.content,
                    "file_path": entity.file_path,
                    "metadata": metadata_json(entity.metadata),
                }
            )

        edges = []
        for entity in entities:
            for relationship in entity.relationships:
                if relationship.target.id not in first_path:
                    raise KnowledgeRelationshipError(
                        entity.id, relationship.field, relationship.target.id
                    )
                edges.append(
                    {
                        "s": entity.id,
                        "t": relationship.target.id,
                        "f": relationship.field,
                        "c": relationship.cardinality,
                    }
                )

        if rows:
            self._conn.execute(
                "UNWIND $rows AS r CREATE (:Entity {id: r.id, kind: r.kind, slug: r.slug,"
                " title: r.title, summary: r.summary, status: r.status, created_at: r.created_at,"
                " updated_at: r.updated_at, content: r.content, file_path: r.file_path,"
                " metadata: r.metadata})",
                {"rows": rows},
            )
        if edges:
            self._conn.execute(
                "UNWIND $edges AS e MATCH (a:Entity {id: e.s}), (b:Entity {id: e.t})"
                " CREATE (a)-[:Rel {field: e.f, cardinality: e.c}]->(b)",
                {"edges": edges},
            )
        self._loaded = True

        loaded_nodes, loaded_edges = self.counts()
        if (loaded_nodes, loaded_edges) != (len(rows), len(edges)):  # defence in depth
            raise RuntimeError(
                f"LadybugDB load mismatch: expected {len(rows)} nodes / {len(edges)} edges, "
                f"found {loaded_nodes} / {loaded_edges}"
            )

    # ---- queries ------------------------------------------------------------------------

    def query(self, cypher: str, params: dict[str, Any] | None = None) -> list[list[Any]]:
        result = self._conn.execute(cypher, params or {})
        rows: list[list[Any]] = []
        while result.has_next():
            rows.append(result.get_next())
        return rows

    def counts(self) -> tuple[int, int]:
        nodes = self.query("MATCH (n:Entity) RETURN count(n)")[0][0]
        edges = self.query("MATCH ()-[r:Rel]->() RETURN count(r)")[0][0]
        return nodes, edges

    # getParents / getChildren / getRelated, as in kernel/pipeline/graph.ts: parents are the targets
    # of outgoing edges, children the sources of incoming edges, related their union (no duplicates).
    # The TypeScript versions return insertion order; these return byte order of the id.

    def get_parents(self, entity_id: str) -> list[str]:
        rows = self.query(
            "MATCH (n:Entity {id: $id})-[:Rel]->(p:Entity) RETURN DISTINCT p.id ORDER BY p.id",
            {"id": entity_id},
        )
        return sorted((r[0] for r in rows), key=byte_key)

    def get_children(self, entity_id: str) -> list[str]:
        rows = self.query(
            "MATCH (c:Entity)-[:Rel]->(n:Entity {id: $id}) RETURN DISTINCT c.id ORDER BY c.id",
            {"id": entity_id},
        )
        return sorted((r[0] for r in rows), key=byte_key)

    def get_related(self, entity_id: str) -> list[str]:
        rows = self.query(
            "MATCH (n:Entity {id: $id})-[:Rel]-(x:Entity) WHERE x.id <> $id"
            " RETURN DISTINCT x.id ORDER BY x.id",
            {"id": entity_id},
        )
        return sorted((r[0] for r in rows), key=byte_key)

    # ---- export reads -------------------------------------------------------------------

    def entity_rows(self) -> list[list[Any]]:
        """Rows in the order ArtifactKnowledgeSourceAdapter reads them: created_at DESC, id ASC."""
        rows = self.query(
            "MATCH (n:Entity) RETURN n.id, n.kind, n.slug, n.title, n.summary, n.status,"
            " n.created_at, n.updated_at, n.content, n.file_path, n.metadata"
            " ORDER BY n.created_at DESC, n.id ASC"
        )
        # Stable two-pass sort = (created_at DESC, id ASC) under the pinned byte collation.
        rows.sort(key=lambda r: byte_key(r[0]))
        rows.sort(key=lambda r: byte_key(r[6]), reverse=True)
        return rows

    def relationship_rows(self) -> list[list[Any]]:
        """Rows ordered `source_id, target_id, field`, as the adapter reads them."""
        rows = self.query(
            "MATCH (a:Entity)-[r:Rel]->(b:Entity) RETURN a.id, b.id, r.field, r.cardinality"
            " ORDER BY a.id, b.id, r.field"
        )
        rows.sort(key=lambda r: (byte_key(r[0]), byte_key(r[1]), byte_key(r[2])))
        return rows

    def close(self) -> None:
        self._conn.close()
        self._db.close()

    def __enter__(self) -> "GraphStore":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()
