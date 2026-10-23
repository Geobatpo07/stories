"""Phase 2 Kernel contract (ADR-004): the Python load pipeline must match the TypeScript Kernel.

`expected.json` in each scenario (and validation-issues.json) is produced by the real TS Kernel
(fixtures/kernel-contract/kernel-contract.test.ts). This file asserts the Python port against
those same goldens.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from kernel import (
    KnowledgeParseError,
    KnowledgeRelationshipError,
    KnowledgeValidationError,
    load_all,
)
from schemas import DOMAIN_MODELS

CONTRACT = Path(__file__).resolve().parents[2] / "fixtures" / "kernel-contract"
SCENARIOS = sorted(p for p in (CONTRACT / "scenarios").iterdir() if p.is_dir())


def snapshot(root: Path) -> dict[str, Any]:
    try:
        return {"outcome": "ok", "entities": [e.to_dict() for e in load_all(root)]}
    except KnowledgeValidationError as e:
        error = {"name": "KnowledgeValidationError", "filePath": e.file_path,
                 "issues": [i.to_dict() for i in e.issues]}
    except KnowledgeParseError as e:
        error = {"name": "KnowledgeParseError", "filePath": e.file_path}
    except KnowledgeRelationshipError as e:
        error = {"name": "KnowledgeRelationshipError", "sourceId": e.source_id, "field": e.field,
                 "danglingTargetId": e.dangling_target_id, "message": str(e)}
    return {"outcome": "error", "error": error}


@pytest.mark.parametrize("scenario", SCENARIOS, ids=lambda p: p.name)
def test_scenario_matches_typescript_kernel(scenario: Path) -> None:
    expected = json.loads((scenario / "expected.json").read_text(encoding="utf8"))
    assert snapshot(scenario) == expected


def test_every_scenario_has_a_golden_file() -> None:
    assert SCENARIOS and all((s / "expected.json").exists() for s in SCENARIOS)


def _invalid_cases() -> list[Any]:
    golden = json.loads((CONTRACT / "validation-issues.json").read_text(encoding="utf8"))
    return [pytest.param(key, issues, id=key) for key, issues in golden.items()]


@pytest.mark.parametrize(("key", "issues"), _invalid_cases())
def test_validation_issues_match_zod(key: str, issues: list[Any]) -> None:
    kind, name = key.split("/")
    fixture = json.loads(
        (CONTRACT.parent / "schema-contract" / kind / f"{name}.json").read_text(encoding="utf8")
    )
    with pytest.raises(ValidationError) as caught:
        DOMAIN_MODELS[kind].parse_frontmatter(fixture["input"])
    error = KnowledgeValidationError("f.mdx", caught.value)
    assert [i.to_dict() for i in error.issues] == issues
