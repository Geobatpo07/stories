import { describe, expect, it } from "vitest";
import { buildTargets } from "./registry";

describe("buildTargets", () => {
  it("runs the DuckDB target before the Manifest target, since Manifest reads its checksum", () => {
    expect(buildTargets.map((target) => target.name)).toEqual(["duckdb", "manifest"]);
  });
});
