import { describe, expect, it } from "vitest";
import type { KnowledgeEntity, Relationship, ResolvedRef } from "../types";
import { buildKnowledgeGraph } from "./graph";

function makeEntity(
  id: string,
  kind: KnowledgeEntity["kind"],
  slug: string,
  relationships: Relationship[] = [],
): KnowledgeEntity {
  return {
    id,
    kind,
    slug,
    title: id,
    summary: "",
    status: "draft",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    metadata: {},
    relationships,
    content: "",
    filePath: `${slug}.mdx`,
  };
}

const programRef: ResolvedRef = { id: "program:p", kind: "program", slug: "p", title: "program:p" };

describe("buildKnowledgeGraph", () => {
  it("resolves children (incoming) for a Program referenced by two Questions, and parents (outgoing) for each Question", () => {
    const program = makeEntity("program:p", "program", "p");
    const rel: Relationship = { field: "programSlug", cardinality: "one", target: programRef };
    const q1 = makeEntity("question:q1", "question", "q1", [rel]);
    const q2 = makeEntity("question:q2", "question", "q2", [rel]);

    const graph = buildKnowledgeGraph([program, q1, q2]);

    expect(
      graph
        .getChildren("program:p")
        .map((entity) => entity.id)
        .sort(),
    ).toEqual(["question:q1", "question:q2"]);
    expect(graph.getParents("question:q1").map((entity) => entity.id)).toEqual(["program:p"]);
  });

  it("getRelated is the deduplicated union of parents and children", () => {
    const program = makeEntity("program:p", "program", "p");
    const rel: Relationship = { field: "programSlug", cardinality: "one", target: programRef };
    const question = makeEntity("question:q", "question", "q", [rel]);

    const graph = buildKnowledgeGraph([program, question]);

    expect(graph.getRelated("program:p").map((entity) => entity.id)).toEqual(["question:q"]);
    expect(graph.getRelated("question:q").map((entity) => entity.id)).toEqual(["program:p"]);
  });

  it("returns empty arrays and undefined for an unknown id", () => {
    const graph = buildKnowledgeGraph([]);

    expect(graph.getParents("nope")).toEqual([]);
    expect(graph.getChildren("nope")).toEqual([]);
    expect(graph.getRelated("nope")).toEqual([]);
    expect(graph.getNode("nope")).toBeUndefined();
  });
});
