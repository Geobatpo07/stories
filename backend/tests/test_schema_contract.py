"""Phase 1 schema contract (ADR-004): the Pydantic ports must agree with the Zod schemas.

Validates the SAME fixture files as fixtures/schema-contract/schema-contract.test.ts (Vitest,
against the real domain/*/schema.ts). Each fixture declares valid/invalid and, for valid ones,
the expected normalised output; both languages assert against that one declaration.
"""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from schemas import (
    CONTENT_STATUSES,
    CONTENT_TYPES,
    DOMAIN_MODELS,
    KNOWLEDGE_OBJECT_TYPES,
)

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "schema-contract"


def _cases():
    cases = []
    for kind in DOMAIN_MODELS:
        for path in sorted((FIXTURES / kind).glob("*.json")):
            cases.append(pytest.param(kind, path, id=f"{kind}/{path.stem}"))
    return cases


def test_vocabulary_matches_zod_enums_in_order():
    vocabulary = json.loads((FIXTURES / "vocabulary.json").read_text(encoding="utf8"))
    assert list(CONTENT_STATUSES) == vocabulary["contentStatus"]
    assert list(CONTENT_TYPES) == vocabulary["contentType"]
    assert list(KNOWLEDGE_OBJECT_TYPES) == vocabulary["knowledgeObjectType"]


def test_every_domain_directory_has_a_model():
    on_disk = {p.name for p in FIXTURES.iterdir() if p.is_dir()}
    assert on_disk == set(DOMAIN_MODELS)


@pytest.mark.parametrize("kind", sorted(DOMAIN_MODELS))
def test_kind_has_fixtures_covering_both_outcomes(kind: str):
    outcomes = {
        json.loads(p.read_text(encoding="utf8"))["valid"] for p in (FIXTURES / kind).glob("*.json")
    }
    assert outcomes == {True, False}


@pytest.mark.parametrize(("kind", "path"), _cases())
def test_fixture(kind: str, path: Path):
    fixture = json.loads(path.read_text(encoding="utf8"))
    model = DOMAIN_MODELS[kind]
    if fixture["valid"]:
        assert model.parse_frontmatter(fixture["input"]) == fixture["expected"], fixture[
            "description"
        ]
    else:
        with pytest.raises(ValidationError):
            model.parse_frontmatter(fixture["input"])
