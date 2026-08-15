import { describe, expect, it, vi } from "vitest";

// Isolated in its own file: vi.mock("@/kernel", ...) replaces the module for
// this entire file, which would break pipeline.test.ts's real-Kernel
// integration coverage if they shared a file.
vi.mock("@/kernel", () => ({
  loadEverything: () => {
    throw new Error('Invalid frontmatter in "content/programs/broken.mdx".');
  },
  getKnowledgeGraph: () => {
    throw new Error("unreachable");
  },
}));

describe("runBuildPipeline — Kernel failure", () => {
  it("never rejects; a Kernel error becomes a validationIssue and success: false", async () => {
    const { runBuildPipeline } = await import("./pipeline");

    const result = await runBuildPipeline();

    expect(result.success).toBe(false);
    expect(result.report.success).toBe(false);
    expect(result.report.targetResults).toEqual([]);
    expect(result.report.validationIssues).toEqual([
      { check: "kernel", message: 'Invalid frontmatter in "content/programs/broken.mdx".' },
    ]);
  });
});
