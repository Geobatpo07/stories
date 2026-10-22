"""Step 3: `contentHash()` parity with build/targets/manifest-target.ts, and the pinned collation."""

import json

import pytest

from pipeline.content_hash import content_hash
from pipeline.graph_store import byte_key
from tests.helpers import REPO_ROOT, scenario_entities

CONTRACT = REPO_ROOT / "fixtures" / "build-contract"
HASHES = json.loads((CONTRACT / "content-hashes.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("scenario", sorted(HASHES))
def test_matches_the_real_typescript_content_hash(scenario: str):
    assert content_hash(scenario_entities(scenario)) == HASHES[scenario]


def test_empty_set_hashes_the_empty_string():
    # sha256("") — what TypeScript produces for zero entities
    assert content_hash([]) == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"


def test_input_order_does_not_matter():
    entities = scenario_entities("ok-full")
    assert content_hash(entities) == content_hash(list(reversed(entities)))


def test_hash_changes_when_content_changes():
    import dataclasses

    entities = scenario_entities("ok-full")
    changed = [dataclasses.replace(entities[0], content="different body"), *entities[1:]]
    assert content_hash(changed) != content_hash(entities)


def test_byte_order_equals_node_locale_compare_for_the_legal_id_alphabet():
    ids = json.loads((CONTRACT / "id-collation.json").read_text(encoding="utf-8"))
    assert ids == sorted(ids, key=byte_key)
    assert len(ids) == len(set(ids)) > 200
