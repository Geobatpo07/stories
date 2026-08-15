import { resolve } from "node:path";
import { getKnowledgeGraph, loadEverything } from "@/kernel";
import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import { buildTargets } from "./targets/registry";
import type { BuildTargetContext } from "./targets/types";
import type {
  BuildPipelineOptions,
  BuildPipelineResult,
  BuildReport,
  BuildTargetOutcome,
} from "./types";

/**
 * Compiles the Kernel's Knowledge Graph into deterministic, disk-based
 * artifacts by running every registered `BuildTarget` in order. Never
 * rejects for a content or validation problem — `AuthoringWorkflow.publish()`
 * (`authoring/workflow.ts`) awaits this with no surrounding try/catch and
 * relies on `result.success` alone to decide whether to roll back a
 * publication. Only a genuine infrastructure failure (e.g. disk I/O) rejects.
 */
export async function runBuildPipeline(
  options: BuildPipelineOptions = {},
): Promise<BuildPipelineResult> {
  const startedAt = Date.now();
  const rootDirectory = resolve(options.rootDirectory ?? process.cwd());
  const outputDirectory = resolve(rootDirectory, "database/generated");

  let entities: readonly KnowledgeEntity[];
  let graph: KnowledgeGraph;
  try {
    entities = loadEverything();
    graph = getKnowledgeGraph();
  } catch (error) {
    return conclude(startedAt, {
      countsByKind: {},
      entityCount: 0,
      relationshipCount: 0,
      targetResults: [],
      validationIssues: [{ check: "kernel", message: describeError(error) }],
    });
  }

  const context: BuildTargetContext = {
    entities,
    graph,
    outputDirectory,
    artifacts: new Map(),
    startedAt,
  };

  const targetResults: BuildTargetOutcome[] = [];
  let chainBroken = false;
  for (const target of buildTargets) {
    if (chainBroken) {
      targetResults.push({
        name: target.name,
        success: false,
        message: "Skipped after an earlier target failed.",
        durationMs: 0,
      });
      continue;
    }
    const outcome = await target.run(context);
    targetResults.push(outcome);
    if (!outcome.success) chainBroken = true;
  }

  const relationshipCount = entities.reduce((sum, entity) => sum + entity.relationships.length, 0);

  return conclude(startedAt, {
    countsByKind: countByKind(entities),
    entityCount: entities.length,
    relationshipCount,
    targetResults,
    validationIssues: [],
  });
}

function conclude(
  startedAt: number,
  partial: Omit<BuildReport, "elapsedMs" | "success">,
): BuildPipelineResult {
  const success =
    partial.validationIssues.length === 0 &&
    partial.targetResults.every((target) => target.success);
  const report: BuildReport = { ...partial, elapsedMs: Date.now() - startedAt, success };
  return { success, report };
}

function countByKind(entities: readonly KnowledgeEntity[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const entity of entities) {
    counts[entity.kind] = (counts[entity.kind] ?? 0) + 1;
  }
  return counts;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
