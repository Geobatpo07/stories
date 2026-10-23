"""Step 1 and 2: the LadybugDB working graph, its Cypher queries, and the duplicate-id check."""

import dataclasses

import pytest

from kernel import KnowledgeRelationshipError, Relationship, ResolvedRef
from pipeline.errors import DuplicateEntityError
from pipeline.graph_store import GraphStore, byte_key
from tests.helpers import reference_graph, scenario_entities


@pytest.fixture
def entities():
    return scenario_entities("ok-full")


@pytest.fixture
def store(entities):
    with GraphStore() as s:
        s.load(entities)
        yield s


def test_loads_every_node_and_edge(store, entities):
    assert store.counts() == (len(entities), sum(len(e.relationships) for e in entities))


def test_parents_children_related_match_the_typescript_graph_logic(store, entities):
    reference = reference_graph(entities)
    for entity in entities:
        expected = reference[entity.id]
        assert store.get_parents(entity.id) == sorted(expected["parents"], key=byte_key), entity.id
        assert store.get_children(entity.id) == sorted(expected["children"], key=byte_key), entity.id
        assert store.get_related(entity.id) == sorted(expected["related"], key=byte_key), entity.id


def test_unknown_entity_has_no_neighbours(store):
    assert store.get_parents("question:nope") == []
    assert store.get_children("question:nope") == []
    assert store.get_related("question:nope") == []


def test_both_directions_between_a_pair_are_deduplicated_in_related(store):
    # program:lab <-> question:q-one is linked both ways (relatedQuestionSlugs and programSlug).
    assert store.get_related("program:lab").count("question:q-one") == 1


def test_export_reads_use_the_adapters_ordering(store):
    """The adapter reads with DuckDB's own ORDER BY; the export must already be in that order."""
    import random

    import duckdb

    entity_rows = store.entity_rows()
    relationship_rows = store.relationship_rows()
    connection = duckdb.connect(":memory:")
    connection.execute("CREATE TABLE knowledge_entity (id VARCHAR, created_at VARCHAR)")
    connection.execute(
        "CREATE TABLE knowledge_relationship (source_id VARCHAR, target_id VARCHAR, field VARCHAR)"
    )
    shuffled_entities = [(r[0], r[6]) for r in entity_rows]
    shuffled_relationships = [(r[0], r[1], r[2]) for r in relationship_rows]
    random.Random(7).shuffle(shuffled_entities)
    random.Random(7).shuffle(shuffled_relationships)
    connection.executemany("INSERT INTO knowledge_entity VALUES (?, ?)", shuffled_entities)
    connection.executemany("INSERT INTO knowledge_relationship VALUES (?, ?, ?)", shuffled_relationships)

    adapter_entities = connection.execute(
        "SELECT id FROM knowledge_entity ORDER BY created_at DESC, id ASC"
    ).fetchall()
    adapter_relationships = connection.execute(
        "SELECT source_id, target_id, field FROM knowledge_relationship ORDER BY source_id, target_id, field"
    ).fetchall()
    assert [(r[0],) for r in entity_rows] == adapter_entities
    assert [(r[0], r[1], r[2]) for r in relationship_rows] == adapter_relationships


def test_duplicate_id_names_both_files_and_says_how_to_fix_it():
    entities = scenario_entities("ok-duplicate-slug")
    assert len(entities) == 2  # the TypeScript-parity Kernel keeps both
    with GraphStore() as store, pytest.raises(DuplicateEntityError) as raised:
        store.load(entities)
    message = str(raised.value)
    assert 'Duplicate entity "dataset:same"' in message
    assert "content/datasets/a-first.mdx" in message
    assert "content/datasets/b-second.mdx" in message
    assert "change the `slug`" in message
    assert (raised.value.first_path, raised.value.second_path) == (
        "content/datasets/a-first.mdx",
        "content/datasets/b-second.mdx",
    )


def test_duplicate_detection_happens_before_the_colliding_entity_is_loaded(entities):
    duplicate = dataclasses.replace(entities[0], file_path="content/programs/elsewhere.mdx")
    with GraphStore() as store, pytest.raises(DuplicateEntityError):
        store.load([*entities, duplicate])


def test_dangling_edge_is_an_error_not_a_silently_missing_edge(entities):
    question = next(e for e in entities if e.id == "question:q-one")
    ghost = ResolvedRef("program:ghost", "program", "ghost", "Ghost")
    broken = dataclasses.replace(
        question, relationships=(Relationship("programSlug", "one", ghost),)
    )
    with GraphStore() as store, pytest.raises(KnowledgeRelationshipError) as raised:
        store.load([broken])
    assert 'target "program:ghost" does not exist' in str(raised.value)


def test_load_is_single_use(entities):
    with GraphStore() as store:
        store.load(entities)
        with pytest.raises(RuntimeError):
            store.load(entities)


def test_empty_graph_is_valid():
    with GraphStore() as store:
        store.load([])
        assert store.counts() == (0, 0)
        assert store.entity_rows() == []
