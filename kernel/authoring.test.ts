import { describe, expect, it } from "vitest";
import {
  getAuthoringDefinition,
  listAuthoringDefinitions,
  materializeAuthoringObjects,
  validateAuthoringFields,
} from "./authoring";

describe("Kernel authoring API", () => {
  it("generates forms from every registered schema", () => {
    const definitions = listAuthoringDefinitions();
    expect(definitions).toHaveLength(9);
    expect(
      definitions.every((definition) => definition.fields.some((field) => field.name === "title")),
    ).toBe(true);
    expect(getAuthoringDefinition("question").fields).toContainEqual(
      expect.objectContaining({
        name: "programSlug",
        type: "relationship",
        relationshipKind: "program",
        required: true,
      }),
    );
    expect(
      getAuthoringDefinition("note").fields.find((field) => field.name === "noteType")?.options,
    ).toContain("research-note");
  });

  it("returns friendly validation messages instead of Zod errors", () => {
    const result = validateAuthoringFields("software", {});
    expect(result.success).toBe(false);
    expect(result.issues).toContainEqual({ field: "title", message: "This field is required." });
    expect(result.issues.map((issue) => issue.message).join(" ")).not.toContain("Zod");
  });

  it("normalizes fields and resolves model relationships", () => {
    const model = materializeAuthoringObjects([
      {
        kind: "program",
        fields: baseFields({
          theme: "Methods",
          leadResearcher: "Researcher",
          relatedQuestionSlugs: [],
          tags: ["z", "a", "a"],
        }),
        content: "Program narrative",
      },
      {
        kind: "question",
        fields: baseFields({ slug: "project", programSlug: "record" }),
        content: "Project narrative",
      },
    ]);
    expect(model.entities[0]?.metadata.tags).toEqual(["a", "z"]);
    expect(model.graph.getParents("question:project")[0]?.id).toBe("program:record");
  });
});

function baseFields(extra: Readonly<Record<string, unknown>> = {}) {
  return {
    title: "Research record",
    slug: "record",
    description: "A focused research record.",
    date: "2026-08-03",
    status: "draft",
    tags: [],
    ...extra,
  };
}
