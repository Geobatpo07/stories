"""Step 5: the Python `duckdb` pin and the Node reader pin must move together.

`knowledge.duckdb` is written by the Python `duckdb` package and read by `@duckdb/node-api`. A bump
on either side that changes DuckDB's storage format breaks production at read time (duckdb 2.0.0
already did once: "database file with version number 999, but we can only read versions between 64
and 68"). These tests fail on any unilateral bump, and the last one proves the current pair really
works end to end with the real Node reader.
"""

import json
import re
import shutil
import subprocess
from pathlib import Path

import duckdb
import pytest

from pipeline.build import run_build_pipeline
from tests.helpers import REPO_ROOT, SCENARIOS

COMPAT = json.loads((REPO_ROOT / "backend" / "duckdb-compat.json").read_text(encoding="utf-8"))


def test_python_pin_in_pyproject_matches_the_compat_file() -> None:
    pyproject = (REPO_ROOT / "backend" / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'"duckdb==([^"]+)"', pyproject)
    assert match is not None
    assert match.group(1) == COMPAT["python"]


def test_node_pin_in_package_json_matches_the_compat_file() -> None:
    package = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))
    assert package["dependencies"]["@duckdb/node-api"] == COMPAT["node"]  # exact, no ^ or ~


def test_installed_python_duckdb_is_the_pinned_version() -> None:
    assert duckdb.__version__ == COMPAT["python"]


@pytest.mark.skipif(shutil.which("node") is None, reason="node is not installed")
def test_node_reader_opens_a_python_written_artifact(tmp_path: Path) -> None:
    shutil.copytree(SCENARIOS / "ok-full" / "content", tmp_path / "content")
    assert run_build_pipeline(tmp_path).success
    completed = subprocess.run(
        [
            "node",
            str(REPO_ROOT / "backend" / "tools" / "dump-artifact.mjs"),
            str(tmp_path / "database" / "generated"),
            "--tables", "knowledge_entity,knowledge_relationship,knowledge_search_related",
        ],
        cwd=REPO_ROOT, capture_output=True, text=True, encoding="utf-8", check=False,
    )
    assert completed.returncode == 0, completed.stderr
    assert '"id":"program:lab"' in completed.stdout
    assert "knowledge_search_related (adapter order)" in completed.stdout
