import type { BuildTarget } from "./targets/types";
import { describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above the rest of the module, so the fake
// targets must be created inside vi.hoisted() rather than as plain
// module-level consts referenced from the factory below.
const { failing, never } = vi.hoisted(() => {
  const failing: BuildTarget = {
    name: "failing",
    run: vi.fn(async () => ({
      name: "failing",
      success: false,
      message: "simulated failure",
      durationMs: 1,
    })),
  };
  const never: BuildTarget = {
    name: "never",
    run: vi.fn(async () => {
      throw new Error("must not run after an earlier target failed");
    }),
  };
  return { failing, never };
});

// Isolated in its own file: vi.mock("./targets/registry", ...) replaces the
// module for this entire file.
vi.mock("./targets/registry", () => ({ buildTargets: [failing, never] }));

describe("runBuildPipeline — target chain", () => {
  it("skips remaining targets once one fails, without ever rejecting", async () => {
    const { runBuildPipeline } = await import("./pipeline");

    const result = await runBuildPipeline();

    expect(result.success).toBe(false);
    expect(never.run).not.toHaveBeenCalled();
    expect(result.report.targetResults).toEqual([
      { name: "failing", success: false, message: "simulated failure", durationMs: 1 },
      {
        name: "never",
        success: false,
        message: "Skipped after an earlier target failed.",
        durationMs: 0,
      },
    ]);
  });
});
