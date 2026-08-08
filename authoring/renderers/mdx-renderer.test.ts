import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { MarkdownDocument } from "@/components/knowledge/markdown-document";
import type { AuthoringDocument } from "../types";
import { MDXRenderer } from "./mdx-renderer";

const document: AuthoringDocument = {
  version: 1,
  id: "13d964b8-4206-45d0-a6cb-195beb8b0c21",
  kind: "note",
  publicationState: "draft",
  fields: {
    title: "A deterministic story",
    slug: "deterministic-story",
    description: "Renderer contract",
    date: "2026-08-03",
    status: "active",
    tags: ["rendering", "authoring"],
    noteType: "research-note",
  },
  content: "## Finding\r\n\r\nThe result is **stable**.\r\n",
  createdAt: "2026-08-03T12:00:00.000Z",
  updatedAt: "2026-08-03T12:00:00.000Z",
};

describe("MDXRenderer", () => {
  it("generates deterministic, readable MDX with normalized metadata", async () => {
    const renderer = new MDXRenderer();
    const first = await renderer.render(document);
    const second = await renderer.render(document);
    expect(first).toEqual(second);
    expect(first.relativePath).toBe("content/notes/deterministic-story.mdx");
    expect(first.content).toContain('title: "A deterministic story"');
    expect(first.content).toContain('tags: ["authoring", "rendering"]');
    expect(first.content).toMatch(/---\n\n## Finding\n\nThe result is \*\*stable\*\*\.\n$/);
  });

  it("keeps the rendered body compatible with the public reading renderer", async () => {
    const rendered = await new MDXRenderer().render(document);
    const body = rendered.content.split("---\n\n")[1] ?? "";
    const html = renderToStaticMarkup(createElement(MarkdownDocument, { content: body }));
    expect(html).toContain("Finding");
    expect(html).toContain("<strong>stable</strong>");
  });
});
