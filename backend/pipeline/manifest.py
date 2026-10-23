"""Port of build/targets/manifest-target.ts: the same fields, in the same order, same JSON
layout."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

# Mirror build/version.ts. They are independently-bumped TypeScript constants; the values are
# duplicated here and backend/tests/test_artifact_contract.py parses build/version.ts and fails if
# either side moves without the other.
KERNEL_VERSION = "1.0.0"
BUILD_VERSION = "1.0.0"
SCHEMA_VERSION = "1.0.0"

REPO_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_DATABASE_PATH = (
    "database/generated/knowledge.duckdb"  # recorded relative to the project root
)


def platform_version() -> str:
    """`PLATFORM_VERSION` in TypeScript is package.json's version, read statically."""
    version = json.loads((REPO_ROOT / "package.json").read_text(encoding="utf-8"))["version"]
    if not isinstance(version, str):
        raise TypeError(f"package.json version must be a string, got {type(version).__name__}")
    return version


def iso_now() -> str:
    """Like `new Date().toISOString()`: UTC, millisecond precision, trailing Z."""
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def build_manifest(
    *,
    content_hash: str,
    entity_count: int,
    relationship_count: int,
    database_checksum: str,
    generation_duration_ms: int,
    generated_at: str | None = None,
) -> dict[str, Any]:
    return {
        "platformVersion": platform_version(),
        "kernelVersion": KERNEL_VERSION,
        "buildVersion": BUILD_VERSION,
        "schemaVersion": SCHEMA_VERSION,
        "generatedAt": generated_at or iso_now(),
        "contentHash": content_hash,
        "generationDuration": generation_duration_ms,
        "knowledge": {"entities": entity_count, "relationships": relationship_count},
        "artifacts": {
            "knowledgeDatabase": {"file": MANIFEST_DATABASE_PATH, "checksum": database_checksum}
        },
    }


def write_manifest(path: Path, manifest: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # JSON.stringify(manifest, null, 2) + "\n"
    path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
