"""Python counterpart of `runBuildPipeline()` (build/pipeline.ts).

Stages: load + validate (Kernel port, closed-world relationships) -> LadybugDB graph (duplicate-id
and edge checks in the same pass) -> DuckDB export (+ optional search index) -> manifest.

Like the TypeScript version it never raises for a content problem: it returns a result whose
`success` is False and whose `validation_issues` explain why, because the caller (authoring's
publish, later a service endpoint) relies on the flag alone to decide whether to roll back.
Genuine infrastructure failures (disk I/O, a LadybugDB or DuckDB fault) still raise.
"""

import time
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path

from kernel import (
    KnowledgeEntity,
    KnowledgeParseError,
    KnowledgeRelationshipError,
    KnowledgeValidationError,
    load_all,
)

from .content_hash import content_hash
from .duckdb_export import write_knowledge_database
from .errors import DuplicateEntityError
from .graph_store import GraphStore
from .manifest import build_manifest, write_manifest

OUTPUT_SUBDIRECTORY = Path("database") / "generated"


@dataclass
class TargetOutcome:
    name: str
    success: bool
    message: str
    durationMs: int  # noqa: N815 - serialized with the TypeScript report's field names


@dataclass
class BuildReport:
    countsByKind: dict[str, int] = field(default_factory=dict)  # noqa: N815
    entityCount: int = 0  # noqa: N815
    relationshipCount: int = 0  # noqa: N815
    targetResults: list[TargetOutcome] = field(default_factory=list)  # noqa: N815
    validationIssues: list[dict[str, str]] = field(default_factory=list)  # noqa: N815
    elapsedMs: int = 0  # noqa: N815
    success: bool = False


@dataclass
class BuildResult:
    success: bool
    report: BuildReport

    def to_dict(self) -> dict:
        return {"success": self.success, "report": asdict(self.report)}


def _issue(check: str, error: Exception) -> dict[str, str]:
    return {"check": check, "message": str(error)}


def run_build_pipeline(
    root: Path,
    *,
    entities: Sequence[KnowledgeEntity] | None = None,
    include_search_index: bool = True,
) -> BuildResult:
    """Build `<root>/database/generated/{knowledge.duckdb,manifest.json}`.

    `entities` lets a caller supply already-validated entities (the TypeScript round-trip test
    does); by default they are loaded from `<root>/content`.
    """
    started = time.monotonic()
    root = Path(root)
    output_directory = root / OUTPUT_SUBDIRECTORY
    report = BuildReport()

    def elapsed_ms() -> int:
        return int((time.monotonic() - started) * 1000)

    def conclude() -> BuildResult:
        report.elapsedMs = elapsed_ms()
        report.success = not report.validationIssues and all(t.success for t in report.targetResults)
        return BuildResult(report.success, report)

    if entities is None:
        try:
            loaded = load_all(root)
        except (KnowledgeParseError, KnowledgeValidationError, KnowledgeRelationshipError) as error:
            report.validationIssues.append(_issue("kernel", error))
            return conclude()
    else:
        loaded = list(entities)

    store = GraphStore()
    try:
        graph_started = time.monotonic()
        try:
            store.load(loaded)
        except DuplicateEntityError as error:
            report.validationIssues.append(_issue("duplicate-id", error))
            return conclude()
        except KnowledgeRelationshipError as error:
            report.validationIssues.append(_issue("kernel", error))
            return conclude()
        report.targetResults.append(
            TargetOutcome("ladybug-graph", True,
                          f"Loaded {len(loaded)} entities into the LadybugDB working graph.",
                          int((time.monotonic() - graph_started) * 1000))
        )

        database_started = time.monotonic()
        checksum, counts = write_knowledge_database(
            store, output_directory / "knowledge.duckdb", include_search_index=include_search_index
        )
        report.targetResults.append(
            TargetOutcome("duckdb", True,
                          f"Wrote {counts['knowledgeEntity']} entities to database/generated/knowledge.duckdb.",
                          int((time.monotonic() - database_started) * 1000))
        )

        manifest_started = time.monotonic()
        relationship_count = sum(len(e.relationships) for e in loaded)
        manifest = build_manifest(
            content_hash=content_hash(loaded),
            entity_count=len(loaded),
            relationship_count=relationship_count,
            database_checksum=checksum,
            generation_duration_ms=elapsed_ms(),
        )
        write_manifest(output_directory / "manifest.json", manifest)
        report.targetResults.append(
            TargetOutcome("manifest", True,
                          f"Wrote manifest.json ({len(loaded)} entities, {relationship_count} relationships).",
                          int((time.monotonic() - manifest_started) * 1000))
        )
    finally:
        store.close()

    report.countsByKind = dict(Counter(e.kind for e in loaded))
    report.entityCount = len(loaded)
    report.relationshipCount = sum(len(e.relationships) for e in loaded)
    return conclude()
