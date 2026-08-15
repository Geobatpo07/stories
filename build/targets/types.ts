import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import type { BuildArtifactRef, BuildTargetOutcome } from "../types";

/**
 * Shared state threaded through every target, in registry order. Targets
 * that depend on an earlier target's output (the Manifest target needs the
 * DuckDB target's checksum) read it from `artifacts`, keyed by the producing
 * target's `artifactKey`.
 */
export interface BuildTargetContext {
  readonly entities: readonly KnowledgeEntity[];
  readonly graph: KnowledgeGraph;
  readonly outputDirectory: string;
  readonly artifacts: Map<string, BuildArtifactRef>;
  /** `Date.now()` at pipeline start — targets that report a duration derive it from this. */
  readonly startedAt: number;
}

/**
 * One pluggable unit of the pipeline. Adding a target is one file
 * implementing this interface plus one entry in `targets/registry.ts` — see
 * build/README.md for named future candidates (search index, graph export,
 * statistics, embeddings, vector index).
 */
export interface BuildTarget {
  readonly name: string;
  run(context: BuildTargetContext): Promise<BuildTargetOutcome>;
}
