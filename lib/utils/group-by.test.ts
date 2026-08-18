import { describe, expect, it } from "vitest";
import { groupBy } from "./group-by";

describe("groupBy", () => {
  it("groups items under their computed key, preserving order within each group", () => {
    const items = [
      { id: 1, kind: "a" },
      { id: 2, kind: "b" },
      { id: 3, kind: "a" },
    ];
    const groups = groupBy(items, (item) => item.kind);
    expect(groups.a?.map((item) => item.id)).toEqual([1, 3]);
    expect(groups.b?.map((item) => item.id)).toEqual([2]);
  });

  it("returns an empty object for an empty input", () => {
    expect(groupBy([], (item: never) => item)).toEqual({});
  });

  it("omits keys with no matching items", () => {
    const groups = groupBy([{ kind: "a" }], (item) => item.kind);
    expect(groups.b).toBeUndefined();
  });
});
