import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getAuthoringDefinition } from "@/kernel";
import { DynamicForm, RelationshipPicker } from "./studio-editor";

describe("Studio authoring components", () => {
  it("composes a form from a Kernel definition", () => {
    const html = renderToStaticMarkup(
      createElement(DynamicForm, {
        definition: getAuthoringDefinition("software"),
        values: {},
        issues: [],
        relationshipOptions: [],
        onChange: () => undefined,
      }),
    );
    expect(html).toContain("Title *");
    expect(html).toContain('type="url"');
    expect(html).toContain("Status");
  });

  it("renders relationship choices without requiring typed slugs", () => {
    const field = getAuthoringDefinition("question").fields.find(
      (item) => item.name === "programSlug",
    )!;
    const html = renderToStaticMarkup(
      createElement(RelationshipPicker, {
        id: "program",
        field,
        value: "",
        options: [{ kind: "program", slug: "methods", title: "Research Methods" }],
        onChange: () => undefined,
      }),
    );
    expect(html).toContain("Research Methods");
    expect(html).toContain('type="radio"');
  });
});
