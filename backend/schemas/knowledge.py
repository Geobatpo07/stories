"""Port of domain/knowledge/schema.ts (the `note` content type)."""

from typing import Literal, get_args

from .common import Slug
from .frontmatter import BaseFrontmatter

KnowledgeObjectType = Literal[
    "research-note",
    "development-log",
    "reading-note",
    "tutorial",
    "conference-note",
    "book-review",
    "essay",
]
KNOWLEDGE_OBJECT_TYPES: tuple[str, ...] = get_args(KnowledgeObjectType)


class KnowledgeFrontmatter(BaseFrontmatter):
    noteType: KnowledgeObjectType
    programSlug: Slug = None  # type: ignore[assignment]
