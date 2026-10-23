"""Step 6: graph-derived search signals, checked against an independent pure-Python computation."""

import shutil
from collections import defaultdict
from pathlib import Path

import duckdb
import pytest

from kernel import KnowledgeEntity
from pipeline.build import run_build_pipeline
from pipeline.graph_store import GraphStore, byte_key
from pipeline.search_index import (
    CARDINALITY_WEIGHT,
    HOP_DECAY,
    TOP_N,
    compute_search_signals,
)
from tests.helpers import SCENARIOS, scenario_entities


def reference_signals(entities: list[KnowledgeEntity]):
    """Independent implementation straight from the documented scoring rules (no graph database)."""
    edges = [  # (source, target, field, weight)
        (e.id, r.target.id, r.field, CARDINALITY_WEIGHT[r.cardinality])
        for e in entities
        for r in e.relationships
    ]
    incident: dict[str, list[tuple[str, str, float]]] = defaultdict(list)  # node -> (other, field, w)
    for s, t, f, w in edges:
        incident[s].append((t, f, w))
        incident[t].append((s, f, w))

    scores: dict[tuple[str, str], float] = defaultdict(float)
    hops: dict[tuple[str, str], int] = {}
    fields: dict[tuple[str, str], set[str]] = defaultdict(set)
    for a, neighbours in incident.items():
        for m, f1, w1 in neighbours:
            if m == a:
                continue
            scores[(a, m)] += w1
            hops[(a, m)] = 1
            fields[(a, m)].add(f1)
            for b, f2, w2 in incident[m]:
                if b in (a, m):
                    continue
                scores[(a, b)] += w1 * w2 * HOP_DECAY
                hops.setdefault((a, b), 2)
                fields[(a, b)].update((f1, f2))

    related = []
    for a in sorted({k[0] for k in scores}, key=byte_key):
        ranked = sorted(
            ((b, round(sc, 6)) for (x, b), sc in scores.items() if x == a),
            key=lambda item: (-item[1], byte_key(item[0])),
        )[:TOP_N]
        related += [(a, b, sc, hops[(a, b)], ",".join(sorted(fields[(a, b)], key=byte_key))) for b, sc in ranked]
    in_degree = defaultdict(int)
    out_degree = defaultdict(int)
    for s, t, _, _ in edges:
        out_degree[s] += 1
        in_degree[t] += 1
    stats = [(e.id, in_degree[e.id], out_degree[e.id]) for e in sorted(entities, key=lambda e: byte_key(e.id))]
    return related, stats


@pytest.mark.parametrize("scenario", ["ok-full", "ok-empty", "ok-yaml-quirks"])
def test_cypher_signals_equal_the_independent_reference(scenario: str):
    entities = scenario_entities(scenario)
    with GraphStore() as store:
        store.load(entities)
        related, stats = compute_search_signals(store)
    expected_related, expected_stats = reference_signals(entities)
    assert related == expected_related
    assert stats == expected_stats


def test_known_scores_on_the_full_fixture():
    with GraphStore() as store:
        store.load(scenario_entities("ok-full"))
        related, _ = compute_search_signals(store)
    scores = {(a, b): (score, hops, fields) for a, b, score, hops, fields in related}
    # program:lab <-> question:q-one: programSlug (one, 1.0) + relatedQuestionSlugs (many, 0.5), both
    # directions, plus 2-hop paths through shared neighbours (note n-one, presentation t-one).
    score, hops, fields = scores[("program:lab", "question:q-one")]
    assert hops == 1 and fields.startswith("programSlug") and "relatedQuestionSlugs" in fields
    assert score >= 1.5
    # Symmetric by construction.
    assert scores[("question:q-one", "program:lab")][0] == score
    # An isolated entity relates to nothing.
    assert not [k for k in scores if k[0] == "dataset:d-one"]


def test_rows_are_ordered_score_desc_then_byte_order():
    with GraphStore() as store:
        store.load(scenario_entities("ok-full"))
        related, _ = compute_search_signals(store)
    per_entity: dict[str, list[tuple[float, str]]] = defaultdict(list)
    for a, b, score, *_ in related:
        per_entity[a].append((score, b))
    for rows in per_entity.values():
        assert rows == sorted(rows, key=lambda r: (-r[0], byte_key(r[1])))
        assert len(rows) <= TOP_N


def test_tables_are_written_next_to_the_two_base_tables(tmp_path: Path):
    shutil.copytree(SCENARIOS / "ok-full" / "content", tmp_path / "content")
    assert run_build_pipeline(tmp_path).success
    connection = duckdb.connect(str(tmp_path / "database/generated/knowledge.duckdb"), read_only=True)
    tables = [r[0] for r in connection.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1"
    ).fetchall()]
    assert tables == [
        "knowledge_entity", "knowledge_relationship", "knowledge_search_related", "knowledge_search_stats",
    ]
    assert connection.execute("SELECT count(*) FROM duckdb_constraints()").fetchone()[0] == 0
    # A search read is one indexed-by-nothing lookup on a static file: no live backend involved.
    top = connection.execute(
        "SELECT related_id, score FROM knowledge_search_related WHERE entity_id = 'program:lab'"
        " ORDER BY score DESC, related_id LIMIT 3"
    ).fetchall()
    assert top and top[0][1] >= top[-1][1]
    connection.close()


def test_search_index_can_be_skipped(tmp_path: Path):
    shutil.copytree(SCENARIOS / "ok-full" / "content", tmp_path / "content")
    assert run_build_pipeline(tmp_path, include_search_index=False).success
    connection = duckdb.connect(str(tmp_path / "database/generated/knowledge.duckdb"), read_only=True)
    count = connection.execute(
        "SELECT count(*) FROM information_schema.tables WHERE table_name LIKE 'knowledge_search%'"
    ).fetchone()[0]
    connection.close()
    assert count == 0
