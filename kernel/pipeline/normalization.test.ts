import { describe, expect, it } from "vitest";
import type { BaseFrontmatter } from "@/schemas";
import { normalizeFrontmatter } from "./normalization";

function frontmatter(overrides: Partial<BaseFrontmatter>): BaseFrontmatter {
  return {
    title: "Title",
    slug: "slug",
    description: "desc",
    date: "2025-01-01",
    status: "draft",
    tags: [],
    ...overrides,
  };
}

describe("normalizeFrontmatter", () => {
  it("dedupes and sorts tags", () => {
    const result = normalizeFrontmatter(frontmatter({ tags: ["b", "a", "a"] }));
    expect(result.tags).toEqual(["a", "b"]);
  });

  it("leaves other fields unchanged", () => {
    const result = normalizeFrontmatter(frontmatter({ title: "Title", status: "active" }));
    expect(result.title).toBe("Title");
    expect(result.status).toBe("active");
  });
});
