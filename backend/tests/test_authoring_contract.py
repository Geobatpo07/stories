"""Phase 4 audit F2 / the TODO in fixtures/authoring-contract/authoring-contract.test.ts.

definitions.json, validation-cases.json and rendered-mdx.json were produced by the TypeScript
implementation (kernel/authoring.ts, authoring/renderers/mdx-renderer.ts). The Python port must
reproduce them exactly; from now on Python owns the definitions.
"""

import asyncio
import json
from pathlib import Path

import pytest

from authoring.definitions import (
    get_authoring_definition,
    list_authoring_definitions,
    materialize_authoring_objects,
    validate_authoring_fields,
)
from authoring.renderer import MDXRenderer, js_trim, normalize_body, yaml_value
from authoring.types import AuthoringDocument
from authoring.workflow import normalize_slug, publication_path
from kernel.errors import KnowledgeRelationshipError

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures/authoring-contract"


def load(name):
    return json.loads((FIXTURES / name).read_text("utf8"))


def test_the_definitions_of_all_nine_kinds_match_the_typescript_output_exactly():
    assert list_authoring_definitions() == load("definitions.json")


def test_every_definition_has_exactly_the_documented_keys():
    definitions = list_authoring_definitions()
    assert len(definitions) == 9
    for definition in definitions:
        assert sorted(definition) == ["contentDir", "fields", "kind", "label", "publicKind"]


def test_the_key_order_matches_too_so_the_json_text_is_identical():
    assert json.dumps(list_authoring_definitions()) == json.dumps(load("definitions.json"))


def test_get_authoring_definition_returns_the_matching_entry_and_raises_for_an_unknown_kind():
    for definition in list_authoring_definitions():
        assert get_authoring_definition(definition["kind"]) == definition
    with pytest.raises(ValueError, match="Unknown knowledge kind: essay"):
        get_authoring_definition("essay")


CASES = load("validation-cases.json")


@pytest.mark.parametrize("case", CASES, ids=[c["description"] for c in CASES])
def test_validation_gives_the_typescript_accept_reject_results_issue_texts_and_normalization(case):
    assert validate_authoring_fields(case["kind"], case["fields"]) == case["result"]


def test_validation_of_an_unknown_kind_has_the_fixed_issue():
    assert validate_authoring_fields("essay", {}) == {
        "success": False,
        "issues": [{"field": "kind", "message": "Choose a valid knowledge type."}],
    }


@pytest.mark.parametrize(
    ("fields", "expected"),
    [
        ({"title": 1}, [("title", "Expected string, received number")]),
        ({"title": ""}, [("title", "This value must contain at least 1 character(s)")]),
        (
            {"slug": ""},
            [
                ("slug", "This value must contain at least 1 character(s)"),
                ("slug", "Slug must be lowercase kebab-case (e.g. cyclone-modeling)"),
            ],
        ),
        ({"tags": [1]}, [("tags.0", "Expected string, received number")]),
        (
            {"repositoryUrl": "nope"},
            [("repositoryUrl", "Enter a complete web address, including https://.")],
        ),
        ({"status": "x"}, [("status", "Choose one of the available values.")]),
    ],
)
def test_friendly_messages_follow_zods_friendly_message_rules(fields, expected):
    base = {"title": "T", "slug": "t", "description": "d", "date": "2026-08-03"}
    result = validate_authoring_fields("software", {**base, **fields})
    assert result["success"] is False
    assert [
        (i["field"], i["message"]) for i in result["issues"] if i["field"] in dict(expected)
    ] == expected


# ---- rendering: byte-for-byte against the real TypeScript renderer -----------------------------

RENDERED = load("rendered-mdx.json")


@pytest.mark.parametrize("case", RENDERED, ids=[c["name"] for c in RENDERED])
def test_the_renderer_output_is_byte_identical_to_the_typescript_renderer(case):
    document = AuthoringDocument.model_validate(case["document"])
    if "error" in case:
        with pytest.raises(ValueError) as caught:
            asyncio.run(MDXRenderer().render(document))
        assert str(caught.value) == case["error"]
        return
    rendered = asyncio.run(MDXRenderer().render(document))
    assert rendered.relative_path == case["rendered"]["relativePath"]
    assert rendered.content == case["rendered"]["content"]


def test_rendering_is_deterministic():
    document = AuthoringDocument.model_validate(RENDERED[0]["document"])
    first = asyncio.run(MDXRenderer().render(document))
    assert asyncio.run(MDXRenderer().render(document)) == first
    assert first.content.endswith("---\n\n## Finding\n\nThe result is **stable**.\n")
    assert 'tags: ["authoring", "rendering"]' in first.content


def test_javascript_value_formatting_helpers():
    assert yaml_value(True) == "true" and yaml_value(False) == "false"
    assert yaml_value(1.0) == "1" and yaml_value(2) == "2" and yaml_value(None) == "null"
    assert yaml_value(["a", 'b"c']) == '["a", "b\\"c"]'
    assert yaml_value("\ud800") == '"\\ud800"'
    assert js_trim("﻿ x  ") == "x" and js_trim("\x1cx\x1c") == "\x1cx\x1c"
    assert normalize_body("  \r\n ") == "" and normalize_body("a\r\rb\r\n") == "a\n\nb\n"


# ---- small ports -------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("title", "slug"),
    [
        ("My  Research Tool!", "my-research-tool"),
        ("  --Leading and trailing--  ", "leading-and-trailing"),
        ("Café déjà vu", "caf-d-j-vu"),
        ("日本語", ""),
        ("A_B c", "a-b-c"),
    ],
)
def test_slug_normalisation_matches_identifier_service(title, slug):
    assert normalize_slug(title) == slug


@pytest.mark.parametrize("path", ["content/software/x.mdx", "a/./b.mdx", "a/../b.mdx"])
def test_publication_paths_inside_the_root_resolve(path):
    assert publication_path(path).startswith("/project/")


@pytest.mark.parametrize("path", ["../x.mdx", "a/../../x.mdx", "/etc/passwd", ".", ""])
def test_publication_paths_outside_the_root_or_equal_to_it_are_refused(path):
    with pytest.raises(ValueError, match="Publication path leaves the project root."):
        publication_path(path)


def test_materialize_resolves_relationships_and_raises_on_a_dangling_one():
    program = {
        "kind": "program",
        "fields": {
            "title": "Lab",
            "slug": "lab",
            "description": "d",
            "date": "2026-08-03",
            "theme": "t",
            "leadResearcher": "r",
        },
        "content": "",
    }
    question = {
        "kind": "question",
        "fields": {
            "title": "Q",
            "slug": "q",
            "description": "d",
            "date": "2026-08-03",
            "programSlug": "lab",
        },
        "content": "",
    }
    entities = materialize_authoring_objects([program, question])
    assert [e.id for e in entities] == ["program:lab", "question:q"]
    assert [r.target.id for r in entities[1].relationships] == ["program:lab"]
    with pytest.raises(KnowledgeRelationshipError):
        materialize_authoring_objects([question])
