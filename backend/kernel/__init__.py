"""Python port of the Knowledge Kernel's load pipeline (ADR-004 Phase 2).

Scope: discovery, parsing, validation, normalization, the domain factory and relationship
resolution. The graph, the public query API, caching and authoring helpers are later phases.
"""

from .errors import (
    KnowledgeNotFoundError,
    KnowledgeParseError,
    KnowledgeRelationshipError,
    KnowledgeValidationError,
    ValidationIssue,
)
from .loaders.load_all import load_all
from .registry.registrations import REGISTRATIONS
from .types import KnowledgeEntity, Relationship, ResolvedRef

__all__ = [
    "REGISTRATIONS",
    "KnowledgeEntity",
    "KnowledgeNotFoundError",
    "KnowledgeParseError",
    "KnowledgeRelationshipError",
    "KnowledgeValidationError",
    "Relationship",
    "ResolvedRef",
    "ValidationIssue",
    "load_all",
]
