import { describe, expect, it } from "vitest";
import { searchRecords } from "./search";
import type { SearchRecord } from "./types";

const records: SearchRecord[] = [
  {
    id: "program:climate",
    title: "Climate Modeling",
    summary: "Environmental models",
    excerpt: "Cyclone dynamics",
    kind: "Program",
    tags: ["climate-science"],
    date: "2026-01-01",
    href: "/programs/climate",
  },
  {
    id: "note:numerics",
    title: "Numerical baseline",
    summary: "Lax Friedrichs stability",
    excerpt: "A diffusive scheme for cyclone tests",
    kind: "Story",
    tags: ["numerical-methods"],
    date: "2026-02-01",
    href: "/stories/numerics",
  },
];

describe("searchRecords", () => {
  it("ranks exact titles ahead of body-only matches", () => {
    expect(searchRecords(records, "Climate Modeling").map((item) => item.id)).toEqual([
      "program:climate",
    ]);
  });
  it("discovers tags, summaries, and normalized terms", () => {
    expect(searchRecords(records, "numerical methods")[0]?.id).toBe("note:numerics");
    expect(searchRecords(records, "cyclone")).toHaveLength(2);
  });
  it("returns recent knowledge for an empty query", () => {
    expect(searchRecords(records, "").map((item) => item.id)).toEqual([
      "program:climate",
      "note:numerics",
    ]);
  });
});
