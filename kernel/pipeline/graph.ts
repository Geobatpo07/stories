import type {
  KnowledgeEntity,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "../types";

/** Knowledge Graph stage: builds the in-memory node/edge graph from resolved entities. */
export function buildKnowledgeGraph(entities: readonly KnowledgeEntity[]): KnowledgeGraph {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const outgoingByFrom = new Map<string, KnowledgeGraphEdge[]>();
  const incomingByTo = new Map<string, KnowledgeGraphEdge[]>();

  for (const entity of entities) {
    for (const relationship of entity.relationships) {
      const edge: KnowledgeGraphEdge = {
        from: entity.id,
        to: relationship.target.id,
        field: relationship.field,
      };
      appendEdge(outgoingByFrom, entity.id, edge);
      appendEdge(incomingByTo, relationship.target.id, edge);
    }
  }

  const nodes = new Map<string, KnowledgeGraphNode>();
  for (const entity of entities) {
    nodes.set(entity.id, {
      entity,
      outgoing: outgoingByFrom.get(entity.id) ?? [],
      incoming: incomingByTo.get(entity.id) ?? [],
    });
  }

  function getNode(id: string): KnowledgeGraphNode | undefined {
    return nodes.get(id);
  }

  function resolveEdgeTargets(
    edges: readonly KnowledgeGraphEdge[],
    pick: (edge: KnowledgeGraphEdge) => string,
  ): readonly KnowledgeEntity[] {
    const seen = new Set<string>();
    const result: KnowledgeEntity[] = [];
    for (const edge of edges) {
      const id = pick(edge);
      const entity = entityById.get(id);
      if (entity && !seen.has(id)) {
        seen.add(id);
        result.push(entity);
      }
    }
    return result;
  }

  function getParents(id: string): readonly KnowledgeEntity[] {
    const node = nodes.get(id);
    return node ? resolveEdgeTargets(node.outgoing, (edge) => edge.to) : [];
  }

  function getChildren(id: string): readonly KnowledgeEntity[] {
    const node = nodes.get(id);
    return node ? resolveEdgeTargets(node.incoming, (edge) => edge.from) : [];
  }

  function getRelated(id: string): readonly KnowledgeEntity[] {
    const seen = new Set<string>();
    const related: KnowledgeEntity[] = [];
    for (const entity of [...getParents(id), ...getChildren(id)]) {
      if (!seen.has(entity.id)) {
        seen.add(entity.id);
        related.push(entity);
      }
    }
    return related;
  }

  return { nodes, getNode, getParents, getChildren, getRelated };
}

function appendEdge(
  map: Map<string, KnowledgeGraphEdge[]>,
  key: string,
  edge: KnowledgeGraphEdge,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(edge);
  } else {
    map.set(key, [edge]);
  }
}
