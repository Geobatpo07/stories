"""LadybugDB Phase 0 spike: load fixture -> Cypher parity -> export to DuckDB contract."""
import hashlib
import json
import shutil
import sys
import time
from pathlib import Path

import duckdb
import ladybug as lb

from fixture import ENTITIES

HERE = Path(__file__).parent
OUT = HERE / "out"
timings = {}


class timed:
    def __init__(self, name):
        self.name = name

    def __enter__(self):
        self.t = time.perf_counter()

    def __exit__(self, *a):
        timings[self.name] = (time.perf_counter() - self.t) * 1000


if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()

# ---- (a) load ---------------------------------------------------------------
with timed("open_db_ms"):
    db = lb.Database(str(OUT / "graph.lbug"))
    conn = lb.Connection(db)

with timed("create_schema_ms"):
    conn.execute(
        """CREATE NODE TABLE Entity(
        id STRING PRIMARY KEY, kind STRING, slug STRING, title STRING, summary STRING,
        status STRING, created_at STRING, updated_at STRING, content STRING,
        file_path STRING, metadata STRING)"""
    )
    conn.execute("CREATE REL TABLE Rel(FROM Entity TO Entity, field STRING, cardinality STRING)")

BASE = ("id", "kind", "slug", "title", "summary", "status", "created_at", "updated_at",
        "content", "file_path")

with timed("load_nodes_ms"):
    for e in ENTITIES:
        conn.execute(
            "CREATE (:Entity {id:$id, kind:$kind, slug:$slug, title:$title, summary:$summary,"
            " status:$status, created_at:$created_at, updated_at:$updated_at, content:$content,"
            " file_path:$file_path, metadata:$metadata})",
            {**{k: e[k] for k in BASE}, "metadata": json.dumps(e["metadata"])},
        )

with timed("load_edges_ms"):
    for e in ENTITIES:
        for r in e["relationships"]:
            conn.execute(
                "MATCH (a:Entity {id:$s}), (b:Entity {id:$t}) "
                "CREATE (a)-[:Rel {field:$f, cardinality:$c}]->(b)",
                {"s": e["id"], "t": r["target_id"], "f": r["field"], "c": r["cardinality"]},
            )


def rows(q, params=None):
    res = conn.execute(q, params or {})
    out = []
    while res.has_next():
        out.append(res.get_next())
    return out


n_nodes = rows("MATCH (n:Entity) RETURN count(n)")[0][0]
n_edges = rows("MATCH ()-[r:Rel]->() RETURN count(r)")[0][0]
print(f"loaded nodes={n_nodes} edges={n_edges}")

# ---- (b) Cypher equivalents of getParents/getChildren/getRelated ------------
# parents  = targets of outgoing edges; children = sources of incoming edges;
# related  = union of both, de-duplicated by id.
Q_PARENTS = "MATCH (n:Entity {id:$id})-[:Rel]->(p:Entity) RETURN DISTINCT p.id ORDER BY p.id"
Q_CHILDREN = "MATCH (c:Entity)-[:Rel]->(n:Entity {id:$id}) RETURN DISTINCT c.id ORDER BY c.id"
Q_RELATED = (
    "MATCH (n:Entity {id:$id})-[:Rel]-(x:Entity) WHERE x.id <> $id "
    "RETURN DISTINCT x.id ORDER BY x.id"
)


def cypher_graph():
    g = {}
    for e in ENTITIES:
        p = {"id": e["id"]}
        g[e["id"]] = {
            "parents": [r[0] for r in rows(Q_PARENTS, p)],
            "children": [r[0] for r in rows(Q_CHILDREN, p)],
            "related": [r[0] for r in rows(Q_RELATED, p)],
        }
    return g


with timed("query_all_entities_ms"):
    cy = cypher_graph()
with timed("query_single_ms"):
    rows(Q_PARENTS, {"id": "question:q1"})


def reference_graph():
    """Python mirror of createGraph(): insertion-ordered, de-duplicated."""
    by_id = {e["id"]: e for e in ENTITIES}
    out, inc = {}, {}
    for e in ENTITIES:
        for r in e["relationships"]:
            out.setdefault(e["id"], []).append(r["target_id"])
            inc.setdefault(r["target_id"], []).append(e["id"])

    def dedup(xs):
        return list(dict.fromkeys(x for x in xs if x in by_id))

    g = {}
    for e in ENTITIES:
        i = e["id"]
        par, chi = dedup(out.get(i, [])), dedup(inc.get(i, []))
        g[i] = {"parents": par, "children": chi, "related": dedup(par + chi)}
    return g


ref = reference_graph()
mismatch = [
    (i, k, ref[i][k], cy[i][k])
    for i in ref
    for k in ("parents", "children", "related")
    if sorted(ref[i][k]) != sorted(cy[i][k])
]
print("cypher vs python-reference set mismatches:", mismatch or "none")
(OUT / "cypher_graph.json").write_text(json.dumps(cy, indent=2))

# ---- (c) export to the exact DuckDB schema ---------------------------------
# DDL copied verbatim from build/duckdb/schema.ts.
SCHEMA = [
    "DROP TABLE IF EXISTS knowledge_metadata;",
    "DROP TABLE IF EXISTS knowledge_snapshot;",
    "DROP TABLE IF EXISTS knowledge_relationship;",
    "DROP TABLE IF EXISTS knowledge_entity;",
    """CREATE TABLE knowledge_entity (
    id          VARCHAR PRIMARY KEY,
    kind        VARCHAR NOT NULL,
    slug        VARCHAR NOT NULL,
    title       VARCHAR NOT NULL,
    summary     VARCHAR NOT NULL,
    status      VARCHAR NOT NULL,
    created_at  VARCHAR NOT NULL,
    updated_at  VARCHAR NOT NULL,
    content     VARCHAR NOT NULL,
    file_path   VARCHAR NOT NULL,
    metadata    JSON NOT NULL
  );""",
    """CREATE TABLE knowledge_relationship (
    source_id   VARCHAR NOT NULL,
    target_id   VARCHAR NOT NULL,
    field       VARCHAR NOT NULL,
    cardinality VARCHAR NOT NULL
  );""",
    """CREATE TABLE knowledge_snapshot (
    build_id            VARCHAR PRIMARY KEY,
    generated_at        TIMESTAMP NOT NULL,
    content_hash        VARCHAR NOT NULL,
    entity_count        INTEGER NOT NULL,
    relationship_count  INTEGER NOT NULL,
    kernel_version       VARCHAR NOT NULL,
    build_version        VARCHAR NOT NULL,
    schema_version        VARCHAR NOT NULL
  );""",
    """CREATE TABLE knowledge_metadata (
    key   VARCHAR PRIMARY KEY,
    value VARCHAR
  );""",
]

db_path = OUT / "knowledge.duckdb"
with timed("export_ms"):
    ent = rows(
        "MATCH (n:Entity) RETURN n.id, n.kind, n.slug, n.title, n.summary, n.status,"
        " n.created_at, n.updated_at, n.content, n.file_path, n.metadata ORDER BY n.id"
    )
    rel = rows(
        "MATCH (a:Entity)-[r:Rel]->(b:Entity) RETURN a.id, b.id, r.field, r.cardinality"
        " ORDER BY a.id, b.id, r.field"
    )
    con = duckdb.connect(str(db_path))
    for s in SCHEMA:
        con.execute(s)
    con.executemany(
        "INSERT INTO knowledge_entity (id, kind, slug, title, summary, status, created_at,"
        " updated_at, content, file_path, metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?::JSON)",
        ent,
    )
    con.executemany("INSERT INTO knowledge_relationship VALUES (?,?,?,?)", rel)
    content_hash = hashlib.sha256(
        json.dumps(
            sorted(
                [
                    {k: v for k, v in e.items() if k not in ("relationships", "file_path")}
                    for e in ENTITIES
                ],
                key=lambda e: e["id"],
            ),
            sort_keys=True,
            separators=(",", ":"),
        ).encode()
    ).hexdigest()
    con.execute(
        "INSERT INTO knowledge_snapshot VALUES (?, ?::TIMESTAMP, ?, ?, ?, ?, ?, ?)",
        ["spike-build", "2026-10-22T00:00:00", content_hash, len(ent), len(rel),
         "1.0.0", "1.0.0", "1.0.0"],
    )
    con.execute("CHECKPOINT;")
    con.close()

checksum = hashlib.sha256(db_path.read_bytes()).hexdigest()
manifest = {
    "platformVersion": "3.0.0",
    "kernelVersion": "1.0.0",
    "buildVersion": "1.0.0",
    "schemaVersion": "1.0.0",
    "generatedAt": "2026-10-22T00:00:00.000Z",
    "contentHash": content_hash,
    "generationDuration": int(timings["export_ms"]),
    "knowledge": {"entities": len(ent), "relationships": len(rel)},
    "artifacts": {"knowledgeDatabase": {"file": "knowledge.duckdb", "checksum": checksum}},
    "environment": {"node": "n/a (python spike)", "platform": sys.platform, "arch": "x64"},
}
(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf8")

chk = duckdb.connect(str(db_path), read_only=True)
for t in ("knowledge_entity", "knowledge_relationship", "knowledge_snapshot", "knowledge_metadata"):
    print(t, [(c[0], c[1]) for c in chk.execute(f"DESCRIBE {t}").fetchall()])
chk.close()
print("timings(ms):", {k: round(v, 2) for k, v in timings.items()})
(OUT / "timings.json").write_text(json.dumps(timings, indent=2))
