import { describe, expect, it } from "vitest";
import { baseFrontmatterSchema } from "@/schemas";
import { KnowledgeRelationshipError } from "../errors";
import type { EntityRegistration } from "../registry/types";
import type { KnowledgeEntity } from "../types";
import { resolveRelationships } from "./relationships";

function makeEntity(
  overrides: Partial<KnowledgeEntity> &
    Pick<KnowledgeEntity, "id" | "kind" | "slug" | "title"> &
    Record<string, unknown>,
): KnowledgeEntity & Record<string, unknown> {
  return {
    summary: "",
    status: "draft",
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    metadata: {},
    relationships: [],
    content: "",
    filePath: `${overrides.slug}.mdx`,
    ...overrides,
  };
}

const programRegistration: EntityRegistration = {
  kind: "program",
  contentDir: "content/programs",
  schema: baseFrontmatterSchema,
  relationshipFields: [],
};

const questionRegistration: EntityRegistration = {
  kind: "question",
  contentDir: "content/questions",
  schema: baseFrontmatterSchema,
  relationshipFields: [{ field: "programSlug", cardinality: "one", targetKind: "program" }],
};

describe("resolveRelationships", () => {
  it("resolves a one-cardinality relationship to the matching target", () => {
    const program = makeEntity({ id: "program:x", kind: "program", slug: "x", title: "Program X" });
    const question = makeEntity({
      id: "question:y",
      kind: "question",
      slug: "y",
      title: "Question Y",
      programSlug: "x",
    });

    const resolved = resolveRelationships(
      [program, question],
      [programRegistration, questionRegistration],
    );
    const resolvedQuestion = resolved.find((entity) => entity.id === "question:y");
    const resolvedProgram = resolved.find((entity) => entity.id === "program:x");

    expect(resolvedQuestion?.relationships).toEqual([
      {
        field: "programSlug",
        cardinality: "one",
        target: { id: "program:x", kind: "program", slug: "x", title: "Program X" },
      },
    ]);
    expect(resolvedProgram?.relationships).toEqual([]);
  });

  it("throws KnowledgeRelationshipError naming the source id, field, and dangling target id", () => {
    const question = makeEntity({
      id: "question:y",
      kind: "question",
      slug: "y",
      title: "Question Y",
      programSlug: "does-not-exist",
    });

    let caught: unknown;
    try {
      resolveRelationships([question], [questionRegistration]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(KnowledgeRelationshipError);
    const relationshipError = caught as KnowledgeRelationshipError;
    expect(relationshipError.sourceId).toBe("question:y");
    expect(relationshipError.field).toBe("programSlug");
    expect(relationshipError.danglingTargetId).toBe("program:does-not-exist");
  });

  it("leaves an optional relationship field unresolved (no entry) when the field is absent", () => {
    const question = makeEntity({
      id: "question:y",
      kind: "question",
      slug: "y",
      title: "Question Y",
    });

    const [resolved] = resolveRelationships([question], [questionRegistration]);

    expect(resolved?.relationships).toEqual([]);
  });
});
