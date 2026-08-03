import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownDocument, TableOfContents } from "./reading";

describe("scientific reading document", () => {
  it("renders GFM tables, footnotes, mathematics, code, and accessible figures", () => {
    const markdown =
      "## Result\n\n| Scheme | Stable |\n| --- | --- |\n| Lax | Yes |\n\nEuler noted this.[^1]\n\n[^1]: Reference note.\n\n$$x^2 + y^2 = z^2$$\n\n```python\nprint('result')\n```\n\n![A radial profile](/figure.png \"Figure 1. Radial profile\")";
    const html = renderToStaticMarkup(createElement(MarkdownDocument, { content: markdown }));
    expect(html).toContain("<table>");
    expect(html).toContain("data-footnotes");
    expect(html).toContain("katex");
    expect(html).toContain("Copy");
    expect(html).toContain("<figure");
    expect(html).toContain("Figure 1. Radial profile");
  });
  it("builds a linked table of contents from the same Runtime content", () => {
    const html = renderToStaticMarkup(
      createElement(TableOfContents, { content: "## Context\n\n### Method" }),
    );
    expect(html).toContain('href="#context"');
    expect(html).toContain('href="#method"');
    expect(html).toContain("<details");
  });
});
