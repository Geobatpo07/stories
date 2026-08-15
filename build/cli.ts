/**
 * build/cli.ts
 *
 * Entry point for `pnpm build:knowledge`. Runs the Knowledge Artifact
 * Pipeline against the real content/ tree, prints a human-readable report,
 * and exits non-zero on failure.
 *
 * Run with: pnpm build:knowledge
 */
import { runBuildPipeline } from "./pipeline";
import { renderReport } from "./report";

async function main(): Promise<void> {
  const result = await runBuildPipeline();
  console.warn(renderReport(result.report));
  if (!result.success) {
    process.exitCode = 1;
  }
}

main();
