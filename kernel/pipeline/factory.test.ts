import { describe, expect, it } from "vitest";
import { baseFrontmatterSchema, type BaseFrontmatter } from "@/schemas";
import type { ParsedSource } from "../parsers/parser";
import type { EntityRegistration } from "../registry/types";
import { createEntity } from "./factory";

const registration: EntityRegistration = {
  kind: "program",
  contentDir: "content/programs",
  schema: baseFrontmatterSchema,
  relationshipFields: [],
};

const parsed: ParsedSource = {
  slug: "environmental-climate-modeling",
  data: {},
  content: "Body text",
  sourcePath: "content/programs/environmental-climate-modeling.mdx",
};

const frontmatter: BaseFrontmatter & Record<string, unknown> = {
  title: "Environmental & Climate Modeling",
  slug: "environmental-climate-modeling",
  description: "A program",
  date: "2025-11-01",
  status: "active",
  tags: ["b", "a"],
  theme: "Applied math",
  leadResearcher: "Geovany",
  relatedQuestionSlugs: ["q1"],
};

describe("createEntity", () => {
  it("builds id as `${kind}:${slug}` and promotes base frontmatter fields", () => {
    const entity = createEntity(registration, parsed, frontmatter);

    expect(entity.id).toBe("program:environmental-climate-modeling");
    expect(entity.kind).toBe("program");
    expect(entity.slug).toBe("environmental-climate-modeling");
    expect(entity.title).toBe("Environmental & Climate Modeling");
    expect(entity.summary).toBe("A program");
    expect(entity.status).toBe("active");
    expect(entity.createdAt).toBe("2025-11-01");
    expect(entity.updatedAt).toBe("2025-11-01");
    expect(entity.content).toBe("Body text");
    expect(entity.filePath).toBe(parsed.sourcePath);
    expect(entity.relationships).toEqual([]);
  });

  it("puts tags in metadata and spreads every non-base field generically", () => {
    const entity = createEntity(registration, parsed, frontmatter);

    expect(entity.metadata).toEqual({ tags: ["b", "a"] });
    expect(entity.theme).toBe("Applied math");
    expect(entity.leadResearcher).toBe("Geovany");
    expect(entity.relatedQuestionSlugs).toEqual(["q1"]);
  });
});
