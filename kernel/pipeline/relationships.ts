import { KnowledgeRelationshipError } from "../errors";
import type { EntityRegistration } from "../registry/types";
import type { KnowledgeEntity, Relationship, ResolvedRef } from "../types";

type FactoryEntity = KnowledgeEntity & Record<string, unknown>;

/**
 * Relationship Resolution stage: turns every `*Slug`/`*Slugs` field named
 * in a registration's `relationshipFields` into a resolved `Relationship`.
 * Runs as a single closed-world pass, after every entity across every
 * collection has already been loaded — a Question can only resolve its
 * `programSlug` once the Program it references is guaranteed to already
 * be in the id map.
 */
export function resolveRelationships(
  entities: readonly FactoryEntity[],
  registrations: readonly EntityRegistration[],
): readonly FactoryEntity[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const registrationByKind = new Map(
    registrations.map((registration) => [registration.kind, registration]),
  );

  return entities.map((entity) => {
    const registration = registrationByKind.get(entity.kind);
    if (!registration || registration.relationshipFields.length === 0) {
      return entity;
    }

    const relationships: Relationship[] = [];
    for (const spec of registration.relationshipFields) {
      const rawValue = entity[spec.field];
      if (rawValue === undefined) continue;

      const slugs =
        spec.cardinality === "many" ? (rawValue as readonly string[]) : [rawValue as string];
      for (const slug of slugs) {
        const targetId = `${spec.targetKind}:${slug}`;
        const target = byId.get(targetId);
        if (!target) {
          throw new KnowledgeRelationshipError(entity.id, spec.field, targetId);
        }
        relationships.push({
          field: spec.field,
          cardinality: spec.cardinality,
          target: toResolvedRef(target),
        });
      }
    }

    return { ...entity, relationships };
  });
}

function toResolvedRef(entity: KnowledgeEntity): ResolvedRef {
  return { id: entity.id, kind: entity.kind, slug: entity.slug, title: entity.title };
}
