"""Port of kernel/registry/types.ts."""

from dataclasses import dataclass
from typing import Literal

from schemas import BaseFrontmatter


@dataclass(frozen=True)
class RelationshipFieldSpec:
    field: str
    cardinality: Literal["one", "many"]
    target_kind: str


@dataclass(frozen=True)
class EntityRegistration:
    """Everything the Kernel needs to know about one entity kind; the only per-kind knowledge."""

    kind: str
    content_dir: str  # relative to the repo root, always '/'-separated
    model: type[BaseFrontmatter]
    relationship_fields: tuple[RelationshipFieldSpec, ...] = ()
