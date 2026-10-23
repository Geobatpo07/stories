"""Port of kernel/pipeline/factory.ts: validated frontmatter -> KnowledgeEntity
(registry-driven)."""

from typing import Any

from schemas.frontmatter import BaseFrontmatter

from ..parsers.parser import ParsedSource
from ..registry.types import EntityRegistration
from ..types import KnowledgeEntity

BASE_FIELDS = frozenset(BaseFrontmatter.model_fields)


def create_entity(
    registration: EntityRegistration, parsed: ParsedSource, frontmatter: dict[str, Any]
) -> KnowledgeEntity:
    extra = {k: v for k, v in frontmatter.items() if k not in BASE_FIELDS}
    return KnowledgeEntity(
        id=f"{registration.kind}:{frontmatter['slug']}",
        kind=registration.kind,
        slug=frontmatter["slug"],
        title=frontmatter["title"],
        summary=frontmatter["description"],
        status=frontmatter["status"],
        created_at=frontmatter["date"],
        updated_at=frontmatter["date"],
        # Kind-specific fields live in metadata too (matches kernel/pipeline/factory.ts after
        # af1834e):
        # the DuckDB artifact persists only metadata, so they would otherwise be lost.
        metadata={"tags": frontmatter["tags"], **extra},
        relationships=(),
        content=parsed.content,
        file_path=parsed.source_path,
        extra=extra,
    )
