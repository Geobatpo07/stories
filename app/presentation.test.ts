import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InformationGrid, StatisticsPanel } from "@/components/shared/primitives";
import { SiteShell } from "@/components/layout/site-shell";
import { ResearchNavigation } from "@/components/knowledge/research-navigation";
import type { KnowledgeEntity } from "@/kernel";

const root = process.cwd();
describe("Sprint 5 presentation composition", () => {
  it("implements every required route", () => {
    const routes = [
      "app/page.tsx",
      "app/laboratory/page.tsx",
      "app/programs/page.tsx",
      "app/programs/[slug]/page.tsx",
      "app/projects/page.tsx",
      "app/projects/[slug]/page.tsx",
      "app/stories/page.tsx",
      "app/stories/[slug]/page.tsx",
      "app/artifacts/page.tsx",
      "app/artifacts/[kind]/[slug]/page.tsx",
      "app/search/page.tsx",
      "app/not-found.tsx",
      "app/loading.tsx",
      "app/error.tsx",
      "app/global-error.tsx",
    ];
    for (const route of routes) expect(() => readFileSync(join(root, route), "utf8")).not.toThrow();
  });
  it("renders semantic navigation and a keyboard skip link", () => {
    const markup = renderToStaticMarkup(
      createElement(SiteShell, null, createElement("main", { id: "main-content" }, "Research")),
    );
    expect(markup).toContain("Skip to content");
    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain("<main");
    expect(markup).toContain("<footer");
  });
  it("composes reusable statistics and metadata definitions", () => {
    const markup = renderToStaticMarkup(
      createElement(
        "div",
        null,
        createElement(StatisticsPanel, { items: [{ label: "Stories", value: 3 }] }),
        createElement(InformationGrid, { items: [{ label: "Status", value: "Active" }] }),
      ),
    );
    expect(markup).toContain("<dl");
    expect(markup).toContain("Stories");
    expect(markup).toContain("Status");
  });
  it("exposes previous, next, parent, and children through one semantic navigation", () => {
    const make = (id: string): KnowledgeEntity => ({
      id: `note:${id}`,
      kind: "note",
      slug: id,
      title: id,
      summary: id,
      status: "active",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      metadata: {},
      relationships: [],
      content: "",
      filePath: "hidden",
    });
    const html = renderToStaticMarkup(
      createElement(ResearchNavigation, {
        previous: make("previous"),
        next: make("next"),
        parent: { ...make("parent"), kind: "program", id: "program:parent" },
        descendants: [make("child")],
      }),
    );
    expect(html).toContain('aria-label="Research record navigation"');
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
    expect(html).toContain("Parent research");
    expect(html).toContain("Work within this record");
  });
  it("contains mobile, tablet, reduced-motion, focus, and print safeguards", () => {
    const css = readFileSync(join(root, "styles/globals.css"), "utf8");
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 650px)");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(":focus-visible");
    expect(css).toContain("@media print");
  });
});
