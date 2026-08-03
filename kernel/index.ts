/**
 * The Knowledge Kernel's sole public entry point. Everything outside
 * `kernel/` — `domain/*\/service.ts`, and through it `app/`/`components/`,
 * plus any future adapter (CLI, REST, AI agent) — reaches Kernel data only
 * through what is exported here. Internals (`kernel/parsers`,
 * `kernel/registry`, `kernel/pipeline`, `kernel/loaders`) are not
 * re-exported and must not be imported directly from outside `kernel/`.
 *
 * See `kernel/README.md` for the full lifecycle, dependency rules, and
 * the registry mechanism that makes new entity kinds pluggable.
 */
export {
  findById,
  findBySlug,
  findRelated,
  getKnowledgeGraph,
  loadDatasets,
  loadEverything,
  loadExperiments,
  loadHypotheses,
  loadKnowledgeObjects,
  loadPresentations,
  loadPrograms,
  loadPublications,
  loadQuestions,
  loadResearchNotes,
  loadSoftware,
  loadTutorials,
  resetKernelCache,
} from "./api";

export type {
  DatasetEntity,
  EntityKind,
  ExperimentEntity,
  HypothesisEntity,
  KnowledgeEntity,
  KnowledgeGraph,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeObjectEntity,
  PresentationEntity,
  ProgramEntity,
  PublicationEntity,
  QuestionEntity,
  Relationship,
  ResolvedRef,
  SoftwareEntity,
} from "./types";

export {
  KnowledgeNotFoundError,
  KnowledgeParseError,
  KnowledgeRelationshipError,
  KnowledgeValidationError,
} from "./errors";
export type { ValidationIssue } from "./errors";
