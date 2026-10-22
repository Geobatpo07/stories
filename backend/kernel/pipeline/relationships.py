"""Port of kernel/pipeline/relationships.ts: the closed-world relationship pass.

Runs after every entity across every collection is loaded. A `*Slug`/`*Slugs` field naming an
entity that does not exist raises `KnowledgeRelationshipError` (the friendly dangling-slug
message authoring relies on). This is the pre-LadybugDB validation pass of ADR-004: it stores
nothing; edges are written by the Phase 3 graph stage.
"""

from collections.abc import Sequence
from dataclasses import replace

from ..errors import KnowledgeRelationshipError
from ..registry.types import EntityRegistration
from ..types import KnowledgeEntity, Relationship, ResolvedRef


def resolve_relationships(
    entities: Sequence[KnowledgeEntity], registrations: Sequence[EntityRegistration]
) -> list[KnowledgeEntity]:
    # Like the TS Map built from the entity list: on an id collision the LAST entity wins, silently.
    by_id = {entity.id: entity for entity in entities}
    registration_by_kind = {r.kind: r for r in registrations}

    resolved: list[KnowledgeEntity] = []
    for entity in entities:
        registration = registration_by_kind.get(entity.kind)
        if registration is None or not registration.relationship_fields:
            resolved.append(entity)
            continue

        relationships: list[Relationship] = []
        for spec in registration.relationship_fields:
            if spec.field not in entity.extra:
                continue
            raw = entity.extra[spec.field]
            slugs = list(raw) if spec.cardinality == "many" else [raw]
            for slug in slugs:
                target_id = f"{spec.target_kind}:{slug}"
                target = by_id.get(target_id)
                if target is None:
                    raise KnowledgeRelationshipError(entity.id, spec.field, target_id)
                ref = ResolvedRef(target.id, target.kind, target.slug, target.title)
                relationships.append(Relationship(spec.field, spec.cardinality, ref))
        resolved.append(replace(entity, relationships=tuple(relationships)))
    return resolved
