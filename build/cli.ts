/**
 * build/cli.ts
 *
 * Entry point for `pnpm build:knowledge`. Runs the Knowledge Artifact
 * Pipeline against the real content/ tree, prints a human-readable report,
 * and exits non-zero on failure.
 *
 * `STORIES_BUILD_PRODUCER=python` (the production setting since the Phase 7 cutover, see
 * build/README.md) runs the Python pipeline; unset or `typescript` runs the TypeScript one.
 *
 * Run with: pnpm build:knowledge
 */
import { runPythonProducer, selectedProducer } from "./python-producer";
import { runBuildPipeline } from "./pipeline";
import { renderReport } from "./report";

async function main(): Promise<void> {
  if (selectedProducer() === "python") {
    process.exitCode = runPythonProducer();
    return;
  }
  const result = await runBuildPipeline();
  console.warn(renderReport(result.report));
  if (!result.success) {
    process.exitCode = 1;
  }
}

main();
