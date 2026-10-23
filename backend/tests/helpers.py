"""Shared test helpers for the build-pipeline tests."""

from collections import defaultdict
from pathlib import Path

from kernel import KnowledgeEntity, load_all

REPO_ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = REPO_ROOT / "fixtures" / "kernel-contract" / "scenarios"


def scenario_entities(name: str) -> list[KnowledgeEntity]:
    return load_all(SCENARIOS / name)


def reference_graph(entities: list[KnowledgeEntity]) -> dict[str, dict[str, list[str]]]:
    """Independent pure-Python mirror of createGraph() (kernel/pipeline/graph.ts), insertion
    order."""
    by_id = {e.id for e in entities}
    outgoing: dict[str, list[str]] = defaultdict(list)
    incoming: dict[str, list[str]] = defaultdict(list)
    for entity in entities:
        for relationship in entity.relationships:
            outgoing[entity.id].append(relationship.target.id)
            incoming[relationship.target.id].append(entity.id)

    def dedup(ids: list[str]) -> list[str]:
        return list(dict.fromkeys(i for i in ids if i in by_id))

    graph = {}
    for entity in entities:
        parents = dedup(outgoing[entity.id])
        children = dedup(incoming[entity.id])
        graph[entity.id] = {
            "parents": parents,
            "children": children,
            "related": dedup(parents + children),
        }
    return graph
