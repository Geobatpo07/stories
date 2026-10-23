"""Port of kernel/loaders/load-all.ts: the closed-world orchestrator.

Discovery -> Parsing -> Validation -> Normalization -> Domain Factory for every registration,
then Relationship Resolution across the whole set. Unlike the TS version it takes the repo root
explicitly (no process.cwd()) and is not memoized: caching belongs to the service layer (Phase 4).
"""

from collections.abc import Sequence
from pathlib import Path

from ..parsers.markdown_parser import MarkdownParser
from ..parsers.parser import Parser
from ..pipeline.discovery import discover_source_files
from ..pipeline.factory import create_entity
from ..pipeline.normalization import normalize_frontmatter
from ..pipeline.parsing import parse_source
from ..pipeline.relationships import resolve_relationships
from ..pipeline.validation import validate_frontmatter
from ..registry.registrations import REGISTRATIONS
from ..registry.types import EntityRegistration
from ..types import KnowledgeEntity


def load_all(
    root: Path,
    registrations: Sequence[EntityRegistration] = REGISTRATIONS,
    parser: Parser | None = None,
) -> list[KnowledgeEntity]:
    parser = parser or MarkdownParser()
    entities: list[KnowledgeEntity] = []
    for registration in registrations:
        for path in discover_source_files(root, registration, parser):
            parsed = parse_source(root, path, parser)
            validated = validate_frontmatter(parsed, registration)
            entities.append(create_entity(registration, parsed, normalize_frontmatter(validated)))
    return resolve_relationships(entities, registrations)
