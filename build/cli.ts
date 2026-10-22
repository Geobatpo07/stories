/**
 * build/cli.ts
 *
 * Entry point for `pnpm build:knowledge`. Runs the Knowledge Artifact
 * Pipeline against the real content/ tree, prints a human-readable report,
 * and exits non-zero on failure.
 *
 * `STORIES_BUILD_PRODUCER=python` (dev/CI validation only, see build/README.md) runs the
 * Python pipeline instead; unset or `typescript` is the production behaviour.
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
