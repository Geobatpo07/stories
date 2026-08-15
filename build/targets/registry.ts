import { duckDBBuildTarget } from "./duckdb-target";
import { manifestBuildTarget } from "./manifest-target";
import type { BuildTarget } from "./types";

/**
 * Ordered build targets — the only place any per-target knowledge exists in
 * the pipeline; `runBuildPipeline()` loops over this list generically. The
 * Manifest target reads the DuckDB target's published checksum from the
 * shared `BuildTargetContext`, so DuckDB must run first.
 *
 * To add a target (see docs/roadmap/ROADMAP.md for named candidates —
 * SearchIndexBuildTarget, GraphBuildTarget, StatisticsBuildTarget,
 * EmbeddingBuildTarget, VectorIndexBuildTarget): one file implementing
 * `BuildTarget` next to these, one entry appended here. No orchestrator change.
 */
export const buildTargets: readonly BuildTarget[] = [duckDBBuildTarget, manifestBuildTarget];
