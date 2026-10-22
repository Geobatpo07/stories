"""Port of kernel/types.ts (entities and relationships; the graph types are Phase 3)."""

from dataclasses import dataclass, field
from typing import Any, Literal

EntityKind = str  # one of schemas.content_type.CONTENT_TYPES


@dataclass(frozen=True)
class ResolvedRef:
    """A lightweight, displayable pointer to another entity."""

    id: str
    kind: EntityKind
    slug: str
    title: str

    def to_dict(self) -> dict[str, str]:
        return {"id": self.id, "kind": self.kind, "slug": self.slug, "title": self.title}


@dataclass(frozen=True)
class Relationship:
    field: str
    cardinality: Literal["one", "many"]
    target: ResolvedRef

    def to_dict(self) -> dict[str, Any]:
        return {"field": self.field, "cardinality": self.cardinality, "target": self.target.to_dict()}


@dataclass(frozen=True)
class KnowledgeEntity:
    """What every entity leaving the Kernel looks like, regardless of source or kind.

    `extra` holds every validated non-base frontmatter field (`programSlug`, `theme`, ...). In TS
    those are spread onto the entity object; `to_dict()` does the same so the JSON shapes match.
    """

    id: str
    kind: EntityKind
    slug: str
    title: str
    summary: str
    status: str
    created_at: str
    updated_at: str
    metadata: dict[str, Any]
    relationships: tuple[Relationship, ...]
    content: str
    file_path: str
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "slug": self.slug,
            "title": self.title,
            "summary": self.summary,
            "status": self.status,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "metadata": self.metadata,
            "relationships": [r.to_dict() for r in self.relationships],
            "content": self.content,
            "filePath": self.file_path,
            **self.extra,
        }
