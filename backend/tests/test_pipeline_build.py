"""The orchestrator and CLI: failure behavior (Step 2) and the never-raises contract."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

from pipeline.build import run_build_pipeline
from tests.helpers import REPO_ROOT, SCENARIOS

BACKEND = REPO_ROOT / "backend"


def _scenario_root(tmp_path: Path, name: str) -> Path:
    shutil.copytree(SCENARIOS / name / "content", tmp_path / "content")
    return tmp_path


@pytest.mark.parametrize("name", ["ok-full", "ok-empty", "ok-yaml-quirks", "ok-frontmatter-edges"])
def test_buildable_scenarios_succeed(tmp_path: Path, name: str):
    result = run_build_pipeline(_scenario_root(tmp_path, name))
    assert result.success, result.report.validationIssues
    assert [t.name for t in result.report.targetResults] == ["ladybug-graph", "duckdb", "manifest"]
    assert (tmp_path / "database/generated/knowledge.duckdb").exists()
    assert (tmp_path / "database/generated/manifest.json").exists()


def test_report_counts(tmp_path: Path):
    result = run_build_pipeline(_scenario_root(tmp_path, "ok-full"))
    assert result.report.entityCount == 15
    assert result.report.relationshipCount == 11
    assert result.report.countsByKind["program"] == 2


def test_duplicate_id_fails_the_build_naming_both_files_and_writes_nothing(tmp_path: Path):
    result = run_build_pipeline(_scenario_root(tmp_path, "ok-duplicate-slug"))
    assert result.success is False
    [issue] = result.report.validationIssues
    assert issue["check"] == "duplicate-id"
    assert "content/datasets/a-first.mdx" in issue["message"]
    assert "content/datasets/b-second.mdx" in issue["message"]
    assert not (tmp_path / "database").exists()


@pytest.mark.parametrize(
    ("name", "needle"),
    [
        ("err-dangling-one", 'target "program:no-such-program" does not exist'),
        ("err-validation-many", "Invalid frontmatter in"),
        ("err-malformed-yaml", "Failed to read or parse"),
        ("err-missing-collection-dir", "Failed to read or parse"),
    ],
)
def test_content_problems_fail_without_raising(tmp_path: Path, name: str, needle: str):
    result = run_build_pipeline(_scenario_root(tmp_path, name))
    assert result.success is False
    [issue] = result.report.validationIssues
    assert issue["check"] == "kernel" and needle in issue["message"]
    assert not (tmp_path / "database").exists()


def test_a_failed_rebuild_leaves_the_previous_artifact_untouched(tmp_path: Path):
    root = _scenario_root(tmp_path, "ok-full")
    assert run_build_pipeline(root).success
    manifest_before = (root / "database/generated/manifest.json").read_bytes()
    shutil.copy(
        SCENARIOS / "ok-duplicate-slug/content/datasets/a-first.mdx",
        root / "content/datasets/dup-a.mdx",
    )
    shutil.copy(
        SCENARIOS / "ok-duplicate-slug/content/datasets/b-second.mdx",
        root / "content/datasets/dup-b.mdx",
    )
    assert run_build_pipeline(root).success is False
    assert (root / "database/generated/manifest.json").read_bytes() == manifest_before


def _cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "pipeline.cli", *args],
        cwd=BACKEND, capture_output=True, text=True, encoding="utf-8", check=False,
    )


def test_cli_exits_zero_and_prints_the_report(tmp_path: Path):
    completed = _cli("--root", str(_scenario_root(tmp_path, "ok-full")))
    assert completed.returncode == 0, completed.stderr
    assert json.loads(completed.stdout)["success"] is True


def test_cli_exits_nonzero_and_explains_on_stderr(tmp_path: Path):
    completed = _cli("--root", str(_scenario_root(tmp_path, "ok-duplicate-slug")))
    assert completed.returncode == 1
    assert "[duplicate-id]" in completed.stderr
    assert "a-first.mdx" in completed.stderr and "b-second.mdx" in completed.stderr
