import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import { describe, expect, it } from "vitest";
import { filterStories, parseContent, readingMinutes, tagsOf } from "./knowledge";
import type { LaboratorySnapshot } from "./types";

function entity(id: string, date: string, tags: string[] = []): KnowledgeEntity {
  const [kind = "note", slug = id] = id.split(":");
  return {
    id,
    kind: kind as KnowledgeEntity["kind"],
    slug,
    title: slug,
    summary: slug,
    status: "active",
    createdAt: date,
    updatedAt: date,
    metadata: { tags },
    relationships: [],
    content: "word ".repeat(221),
    filePath: "never-consumed.mdx",
  };
}
const graph: KnowledgeGraph = {
  nodes: new Map(),
  getNode: () => undefined,
  getParents: () => [],
  getChildren: () => [],
  getRelated: () => [],
};
function lab(stories: readonly KnowledgeEntity[]): LaboratorySnapshot {
  return {
    all: stories,
    programs: [],
    projects: [],
    stories,
    artifacts: [],
    metadata: {
      platformVersion: "1",
      kernelVersion: "1",
      buildVersion: "1",
      schemaVersion: "1",
      generatedAt: "2026-01-01T00:00:00Z",
      contentHash: "x",
      generationDuration: 1,
      knowledge: { entities: stories.length, relationships: 0 },
    },
    related: (item) => graph.getRelated(item.id),
    parent: () => undefined,
    children: () => [],
  };
}

describe("presentation knowledge projections", () => {
  it("sorts and filters stories without touching source files", () => {
    const older = entity("note:older", "2025-01-01", ["math"]);
    const newer = entity("note:newer", "2026-01-01", ["climate"]);
    const snapshot = lab([older, newer]);
    expect(
      filterStories(snapshot.stories, snapshot, { sort: "newest" }).map((item) => item.slug),
    ).toEqual(["newer", "older"]);
    expect(filterStories(snapshot.stories, snapshot, { tag: "math" })).toEqual([older]);
    expect(tagsOf(newer)).toEqual(["climate"]);
  });
  it("derives reading time and a navigable document outline", () => {
    const story = entity("note:story", "2026-01-01");
    expect(readingMinutes(story)).toBe(2);
    const blocks = parseContent("## Context\n\nA paragraph.\n\n- one\n- two");
    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "list"]);
    expect(blocks[0]?.id).toBe("context");
  });
});
