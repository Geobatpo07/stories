"""SearchIndexBuildTarget: graph-aware relevance signals computed on the LadybugDB graph.

Persisted into `knowledge.duckdb` as two extra tables next to `knowledge_entity` and
`knowledge_relationship` (the adapter reads only those two and ignores the rest), so search stays
one static artifact with no live backend. The text-matching half stays in
`lib/presentation/search.ts`; DuckDB's full-text-search extension was deliberately not used because
it must be downloaded at install time (a network dependency at build/CI time).

Schema (no keys or constraints, like the rest of the artifact):

    knowledge_search_related(entity_id, related_id, score DOUBLE, hops INTEGER, fields VARCHAR)
    knowledge_search_stats(entity_id, in_degree INTEGER, out_degree INTEGER)

Scoring, "what else is this connected to, and how strongly" (edges are traversed undirected):

    edge weight       cardinality "one" -> 1.0 (a structural parent link), "many" -> 0.5
    1-hop path        weight(edge)
    2-hop path        weight(edge1) * weight(edge2) * 0.5      (a-m-b, b != a, m != a, m != b)
    score(a, b)       sum over every distinct path of those two kinds, rounded to 6 decimals
    hops              1 if any direct edge links a and b, else 2
    fields            sorted, comma-joined relationship fields along the contributing paths

Each entity keeps its TOP_N best related entities, ordered score DESC then related_id ASC (UTF-8
byte order). Rows are stored for both directions of a pair, so a read is one lookup by entity_id.
"""

from collections import defaultdict

from .graph_store import GraphStore, byte_key

TOP_N = 20
HOP_DECAY = 0.5
CARDINALITY_WEIGHT = {"one": 1.0, "many": 0.5}

SEARCH_DDL = (
    "CREATE TABLE knowledge_search_related (entity_id VARCHAR, related_id VARCHAR, score DOUBLE, hops INTEGER, fields VARCHAR);",
    "CREATE TABLE knowledge_search_stats (entity_id VARCHAR, in_degree INTEGER, out_degree INTEGER);",
)

SEARCH_RELATED_COLUMNS = (
    ("entity_id", "VARCHAR"), ("related_id", "VARCHAR"), ("score", "DOUBLE"),
    ("hops", "INTEGER"), ("fields", "VARCHAR"),
)
SEARCH_STATS_COLUMNS = (("entity_id", "VARCHAR"), ("in_degree", "INTEGER"), ("out_degree", "INTEGER"))

Related = tuple[str, str, float, int, str]  # entity_id, related_id, score, hops, fields
Stats = tuple[str, int, int]


def compute_search_signals(store: GraphStore) -> tuple[list[Related], list[Stats]]:
    scores: dict[tuple[str, str], float] = defaultdict(float)
    min_hops: dict[tuple[str, str], int] = {}
    fields: dict[tuple[str, str], set[str]] = defaultdict(set)

    one_hop = store.query(
        "MATCH (a:Entity)-[r:Rel]-(b:Entity) WHERE a.id <> b.id"
        " RETURN a.id, b.id, r.field, r.cardinality ORDER BY a.id, b.id, r.field"
    )
    for a, b, field, cardinality in sorted(
        one_hop, key=lambda r: (byte_key(r[0]), byte_key(r[1]), byte_key(r[2]))
    ):
        key = (a, b)
        scores[key] += CARDINALITY_WEIGHT[cardinality]
        min_hops[key] = 1
        fields[key].add(field)

    two_hop = store.query(
        "MATCH (a:Entity)-[r1:Rel]-(m:Entity)-[r2:Rel]-(b:Entity)"
        " WHERE a.id <> b.id AND m.id <> a.id AND m.id <> b.id"
        " RETURN a.id, b.id, m.id, r1.field, r1.cardinality, r2.field, r2.cardinality"
        " ORDER BY a.id, b.id, m.id"
    )
    for a, b, m, f1, c1, f2, c2 in sorted(
        two_hop,
        key=lambda r: tuple(byte_key(x) for x in (r[0], r[1], r[2], r[3], r[5])),
    ):
        key = (a, b)
        scores[key] += CARDINALITY_WEIGHT[c1] * CARDINALITY_WEIGHT[c2] * HOP_DECAY
        min_hops.setdefault(key, 2)
        fields[key].update((f1, f2))

    by_entity: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for (a, b), score in scores.items():
        by_entity[a].append((b, round(score, 6)))

    related: list[Related] = []
    for entity_id in sorted(by_entity, key=byte_key):
        ranked = sorted(by_entity[entity_id], key=lambda x: (-x[1], byte_key(x[0])))[:TOP_N]
        for related_id, score in ranked:
            key = (entity_id, related_id)
            related.append(
                (entity_id, related_id, score, min_hops[key], ",".join(sorted(fields[key], key=byte_key)))
            )

    out_degree = {r[0]: r[1] for r in store.query("MATCH (a:Entity)-[r:Rel]->() RETURN a.id, count(r)")}
    in_degree = {r[0]: r[1] for r in store.query("MATCH ()-[r:Rel]->(b:Entity) RETURN b.id, count(r)")}
    ids = [r[0] for r in store.query("MATCH (n:Entity) RETURN n.id")]
    stats: list[Stats] = [
        (i, int(in_degree.get(i, 0)), int(out_degree.get(i, 0))) for i in sorted(ids, key=byte_key)
    ]
    return related, stats
