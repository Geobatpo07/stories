import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetKernelCache } from "@/kernel";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runBuildPipeline } from "./pipeline";

// Integration test: runs the real Kernel against the real (currently empty)
// content/ tree, matching kernel/api.test.ts's convention. Only the output
// location is redirected to a temp directory so the test suite never writes
// into the working tree's database/generated/.
const directories: string[] = [];
beforeEach(() => {
  resetKernelCache();
});
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("runBuildPipeline", () => {
  it("succeeds against an empty laboratory and writes both artifacts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "stories-build-pipeline-"));
    directories.push(outputRoot);

    const result = await runBuildPipeline({ rootDirectory: outputRoot });

    expect(result.success).toBe(true);
    expect(result.report.entityCount).toBe(0);
    expect(result.report.relationshipCount).toBe(0);
    expect(result.report.validationIssues).toEqual([]);
    expect(result.report.targetResults.map((target) => target.name)).toEqual([
      "duckdb",
      "manifest",
    ]);
    expect(result.report.targetResults.every((target) => target.success)).toBe(true);
    expect(existsSync(join(outputRoot, "database/generated/knowledge.duckdb"))).toBe(true);
    expect(existsSync(join(outputRoot, "database/generated/manifest.json"))).toBe(true);
  });

  it("defaults rootDirectory to process.cwd()", async () => {
    const result = await runBuildPipeline();
    expect(result.success).toBe(true);
  });
});
