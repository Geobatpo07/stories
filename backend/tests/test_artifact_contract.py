"""Step 3: the Python producer must emit today's artifact contract (build/targets/*.ts)."""

import hashlib
import json
import re
import shutil
from pathlib import Path

import duckdb
import pytest

from pipeline import duckdb_export, manifest
from pipeline.build import run_build_pipeline
from tests.helpers import REPO_ROOT, SCENARIOS

DUCKDB_TARGET = (REPO_ROOT / "build/targets/duckdb-target.ts").read_text(encoding="utf-8")
MANIFEST_TARGET = (REPO_ROOT / "build/targets/manifest-target.ts").read_text(encoding="utf-8")
VERSION_TS = (REPO_ROOT / "build/version.ts").read_text(encoding="utf-8")


def _typescript_create_statements() -> list[str]:
    return re.findall(r'"(CREATE TABLE [^"]+)"', DUCKDB_TARGET)


def test_ddl_is_copied_verbatim_from_duckdb_target_ts():
    statements = _typescript_create_statements()
    assert statements == [duckdb_export.CREATE_ENTITY, duckdb_export.CREATE_RELATIONSHIP]
    for statement in statements:
        assert "PRIMARY KEY" not in statement and "NOT NULL" not in statement


def test_drop_statements_match_typescript():
    assert re.findall(r'"(DROP TABLE IF EXISTS [^"]+)"', DUCKDB_TARGET) == list(
        duckdb_export.DROP_STATEMENTS
    )


def test_version_constants_match_build_version_ts():
    for name, value in (
        ("KERNEL_VERSION", manifest.KERNEL_VERSION),
        ("BUILD_VERSION", manifest.BUILD_VERSION),
        ("SCHEMA_VERSION", manifest.SCHEMA_VERSION),
    ):
        assert re.search(rf'export const {name} = "([^"]+)"', VERSION_TS).group(1) == value


def test_manifest_has_exactly_the_typescript_fields_in_the_same_order():
    body = MANIFEST_TARGET[MANIFEST_TARGET.index("const manifest = {") :]
    body = body[: body.index("};")]
    typescript_keys = re.findall(r"^\s{6}(\w+):", body, re.MULTILINE)
    produced = manifest.build_manifest(
        content_hash="h", entity_count=0, relationship_count=0,
        database_checksum="c", generation_duration_ms=0,
    )
    assert list(produced) == typescript_keys
    assert manifest.MANIFEST_DATABASE_PATH == re.search(
        r'MANIFEST_RELATIVE_PATH = "([^"]+)"', DUCKDB_TARGET
    ).group(1)


def test_platform_version_comes_from_package_json():
    assert manifest.platform_version() == json.loads((REPO_ROOT / "package.json").read_text())["version"]


@pytest.fixture
def built(tmp_path: Path):
    shutil.copytree(SCENARIOS / "ok-full" / "content", tmp_path / "content")
    result = run_build_pipeline(tmp_path, include_search_index=False)
    assert result.success, result.report.validationIssues
    return tmp_path / "database" / "generated"


def test_artifact_has_exactly_two_tables_and_no_constraints(built: Path):
    connection = duckdb.connect(str(built / "knowledge.duckdb"), read_only=True)
    tables = [r[0] for r in connection.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY 1"
    ).fetchall()]
    assert tables == ["knowledge_entity", "knowledge_relationship"]
    assert connection.execute("SELECT count(*) FROM duckdb_constraints()").fetchone()[0] == 0
    columns = connection.execute(
        "SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns"
        " ORDER BY table_name, ordinal_position"
    ).fetchall()
    assert [(t, c, d) for t, c, d, _ in columns] == [
        *[("knowledge_entity", c, d) for c, d in [
            ("id", "VARCHAR"), ("kind", "VARCHAR"), ("slug", "VARCHAR"), ("title", "VARCHAR"),
            ("summary", "VARCHAR"), ("status", "VARCHAR"), ("created_at", "VARCHAR"),
            ("updated_at", "VARCHAR"), ("content", "VARCHAR"), ("file_path", "VARCHAR"),
            ("metadata", "JSON"),
        ]],
        *[("knowledge_relationship", c, "VARCHAR") for c in ("source_id", "target_id", "field", "cardinality")],
    ]
    assert {n for *_, n in columns} == {"YES"}  # nullable everywhere: no NOT NULL
    connection.close()


def test_manifest_matches_the_database_it_describes(built: Path):
    data = json.loads((built / "manifest.json").read_text(encoding="utf-8"))
    database = built / "knowledge.duckdb"
    assert data["artifacts"]["knowledgeDatabase"] == {
        "file": "database/generated/knowledge.duckdb",
        "checksum": hashlib.sha256(database.read_bytes()).hexdigest(),
    }
    connection = duckdb.connect(str(database), read_only=True)
    assert data["knowledge"] == {
        "entities": connection.execute("SELECT count(*) FROM knowledge_entity").fetchone()[0],
        "relationships": connection.execute("SELECT count(*) FROM knowledge_relationship").fetchone()[0],
    }
    connection.close()
    assert (built / "manifest.json").read_text(encoding="utf-8").endswith("}\n")
    assert not list(built.glob("*.wal"))


def test_metadata_column_carries_kind_specific_fields(built: Path):
    """The bug fixed in af1834e: theme / leadResearcher must reach the artifact."""
    connection = duckdb.connect(str(built / "knowledge.duckdb"), read_only=True)
    metadata = json.loads(
        connection.execute("SELECT metadata FROM knowledge_entity WHERE id = 'program:lab'").fetchone()[0]
    )
    connection.close()
    assert metadata["theme"] == "Climate"
    assert metadata["leadResearcher"] == "A. Person"
    assert metadata["relatedQuestionSlugs"] == ["q-two", "q-one"]
    assert metadata["tags"] == ["alpha", "zeta", "\U0001f600", "ﬁ"]


def test_metadata_json_text_matches_javascript_json_stringify(built: Path):
    connection = duckdb.connect(str(built / "knowledge.duckdb"), read_only=True)
    text = connection.execute(
        "SELECT metadata::VARCHAR FROM knowledge_entity WHERE id = 'program:lab'"
    ).fetchone()[0]
    connection.close()
    # Compact separators and raw non-ASCII, key order = tags first then frontmatter field order.
    assert text == (
        '{"tags":["alpha","zeta","\U0001f600","ﬁ"],"theme":"Climate",'
        '"leadResearcher":"A. Person","relatedQuestionSlugs":["q-two","q-one"]}'
    )


def test_rebuilding_replaces_the_previous_artifact(tmp_path: Path):
    shutil.copytree(SCENARIOS / "ok-full" / "content", tmp_path / "content")
    first = run_build_pipeline(tmp_path)
    second = run_build_pipeline(tmp_path, include_search_index=False)
    assert first.success and second.success
    connection = duckdb.connect(str(tmp_path / "database/generated/knowledge.duckdb"), read_only=True)
    tables = {r[0] for r in connection.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
    ).fetchall()}
    connection.close()
    assert tables == {"knowledge_entity", "knowledge_relationship"}  # no leftovers from run one
