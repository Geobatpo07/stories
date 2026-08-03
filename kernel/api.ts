import { createMemoized, resetKernelCache } from "./cache";
import { KnowledgeNotFoundError } from "./errors";
import { loadAll } from "./loaders/load-all";
import { buildKnowledgeGraph } from "./pipeline/graph";
import type {
  DatasetEntity,
  EntityKind,
  ExperimentEntity,
  HypothesisEntity,
  KnowledgeEntity,
  KnowledgeGraph,
  KnowledgeObjectEntity,
  PresentationEntity,
  ProgramEntity,
  PublicationEntity,
  QuestionEntity,
  SoftwareEntity,
} from "./types";

export { resetKernelCache };

const graphCache = createMemoized(() => buildKnowledgeGraph(loadAll()));

/**
 * Filters the loaded set to one kind and casts to its enriched entity
 * type. Safe: Zod already guaranteed the shape at Validation, and the
 * Domain Factory promoted every extra field generically — this is the
 * single, controlled point where that guarantee becomes a static type.
 */
function byKind<T extends KnowledgeEntity>(kind: EntityKind): readonly T[] {
  return loadAll().filter((entity) => entity.kind === kind) as unknown as readonly T[];
}

export function loadPrograms(): readonly ProgramEntity[] {
  return byKind<ProgramEntity>("program");
}

export function loadQuestions(): readonly QuestionEntity[] {
  return byKind<QuestionEntity>("question");
}

export function loadHypotheses(): readonly HypothesisEntity[] {
  return byKind<HypothesisEntity>("hypothesis");
}

export function loadExperiments(): readonly ExperimentEntity[] {
  return byKind<ExperimentEntity>("experiment");
}

export function loadKnowledgeObjects(): readonly KnowledgeObjectEntity[] {
  return byKind<KnowledgeObjectEntity>("note");
}

/** Filtered view over `loadKnowledgeObjects()` — see domain/knowledge/README.md for why ResearchNote has no separate schema/collection. */
export function loadResearchNotes(): readonly KnowledgeObjectEntity[] {
  return loadKnowledgeObjects().filter((entity) => entity.noteType === "research-note");
}

/** Filtered view over `loadKnowledgeObjects()` — see domain/knowledge/README.md for why Tutorial has no separate schema/collection. */
export function loadTutorials(): readonly KnowledgeObjectEntity[] {
  return loadKnowledgeObjects().filter((entity) => entity.noteType === "tutorial");
}

export function loadSoftware(): readonly SoftwareEntity[] {
  return byKind<SoftwareEntity>("software");
}

export function loadPublications(): readonly PublicationEntity[] {
  return byKind<PublicationEntity>("publication");
}

export function loadDatasets(): readonly DatasetEntity[] {
  return byKind<DatasetEntity>("dataset");
}

export function loadPresentations(): readonly PresentationEntity[] {
  return byKind<PresentationEntity>("presentation");
}

export function loadEverything(): readonly KnowledgeEntity[] {
  return loadAll();
}

export function findBySlug(kind: EntityKind, slug: string): KnowledgeEntity | undefined {
  return findById(`${kind}:${slug}`);
}

export function findById(id: string): KnowledgeEntity | undefined {
  return loadAll().find((entity) => entity.id === id);
}

/**
 * Throws `KnowledgeNotFoundError` for an unknown id (almost always a typo)
 * rather than silently returning an empty array — an entity that genuinely
 * has zero relationships also returns `[]`, so collapsing "unknown id" into
 * the same empty result would hide real bugs.
 */
export function findRelated(id: string): readonly KnowledgeEntity[] {
  const graph = getKnowledgeGraph();
  if (!graph.getNode(id)) {
    throw new KnowledgeNotFoundError(id);
  }
  return graph.getRelated(id);
}

export function getKnowledgeGraph(): KnowledgeGraph {
  return graphCache.get();
}
