import { describe, expect, it } from "vitest";
import { renderReport } from "./report";
import type { BuildReport } from "./types";

function report(overrides: Partial<BuildReport> = {}): BuildReport {
  return {
    countsByKind: {},
    entityCount: 0,
    relationshipCount: 0,
    targetResults: [],
    validationIssues: [],
    elapsedMs: 5,
    success: true,
    ...overrides,
  };
}

describe("renderReport", () => {
  it("leads with success or failure and always shows the headline counts", () => {
    expect(renderReport(report({ success: true }))).toContain("Build succeeded.");
    expect(renderReport(report({ success: false }))).toContain("Build failed.");
    expect(renderReport(report({ entityCount: 3, relationshipCount: 2 }))).toContain(
      "Entities: 3  Relationships: 2",
    );
  });

  it("lists counts by kind, sorted", () => {
    const text = renderReport(report({ countsByKind: { question: 2, program: 1 } }));
    expect(text.indexOf("program: 1")).toBeLessThan(text.indexOf("question: 2"));
  });

  it("marks each target with a check or cross and includes its message", () => {
    const text = renderReport(
      report({
        targetResults: [
          { name: "duckdb", success: true, message: "ok", durationMs: 10 },
          { name: "manifest", success: false, message: "no artifact", durationMs: 0 },
        ],
      }),
    );
    expect(text).toContain("✓ duckdb (10ms) — ok");
    expect(text).toContain("✗ manifest (0ms) — no artifact");
  });

  it("lists validation issues with their check name", () => {
    const text = renderReport(
      report({ validationIssues: [{ check: "kernel", message: "dangling reference" }] }),
    );
    expect(text).toContain("[kernel] dangling reference");
  });
});
