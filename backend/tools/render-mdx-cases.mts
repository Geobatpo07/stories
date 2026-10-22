// Generates fixtures/authoring-contract/rendered-mdx.json: the REAL TypeScript MDXRenderer's
// output for a set of drafts, so the Python renderer (backend/authoring/renderer.py) can be
// checked byte for byte. Run from the repository root:
//   node_modules/.bin/tsx --tsconfig tsconfig.json backend/tools/render-mdx-cases.mts \
//     > fixtures/authoring-contract/rendered-mdx.json
import { MDXRenderer } from "../../authoring/renderers/mdx-renderer";
import type { AuthoringDocument } from "../../authoring/types";

const base = {
  version: 1,
  id: "13d964b8-4206-45d0-a6cb-195beb8b0c21",
  publicationState: "draft",
  createdAt: "2026-08-03T12:00:00.000Z",
  updatedAt: "2026-08-03T12:00:00.000Z",
} as const;

const common = { description: "Renderer contract", date: "2026-08-03", status: "active" };

const cases: { name: string; document: AuthoringDocument }[] = [
  {
    name: "note with CRLF body and unsorted tags",
    document: {
      ...base,
      kind: "note",
      fields: {
        ...common,
        title: "A deterministic story",
        slug: "deterministic-story",
        tags: ["rendering", "authoring"],
        noteType: "research-note",
      },
      content: "## Finding\r\n\r\nThe result is **stable**.\r\n",
    },
  },
  {
    name: "unicode, quotes, backslash and a control character in strings",
    document: {
      ...base,
      kind: "software",
      fields: {
        ...common,
        title: 'Café "É–日本語🙂" \\ tab\there',
        slug: "cafe",
        description: "line1\nline2 end\u007f",
        tags: ["é", "z", "a", "日本"],
        repositoryUrl: "https://example.com/a?b=c&d=é",
        license: "MIT",
      },
      content: "x",
    },
  },
  {
    name: "empty body",
    document: {
      ...base,
      kind: "dataset",
      fields: { ...common, title: "Empty", slug: "empty", tags: [] },
      content: "",
    },
  },
  {
    name: "body of whitespace only",
    document: {
      ...base,
      kind: "dataset",
      fields: { ...common, title: "Blank", slug: "blank", tags: [] },
      content: " \n\t \r\n ",
    },
  },
  {
    name: "body trimmed with JavaScript whitespace (BOM, NBSP, line separator)",
    document: {
      ...base,
      kind: "dataset",
      fields: { ...common, title: "Trim", slug: "trim", tags: [] },
      content: "﻿   text  　﻿",
    },
  },
  {
    name: "lone CR line endings inside the body",
    document: {
      ...base,
      kind: "publication",
      fields: {
        ...common,
        title: "Paper",
        slug: "paper",
        tags: ["x"],
        coAuthors: ["A. Person", 'B "Quoted"'],
        venue: "Journal",
        doi: "10.1000/xyz",
      },
      content: "a\rb\r\nc\n\n\nd",
    },
  },
  {
    name: "presentation with relationships and optional urls",
    document: {
      ...base,
      kind: "presentation",
      fields: {
        ...common,
        title: "Talk",
        slug: "talk",
        tags: [],
        slidesUrl: "https://example.com/s",
        programSlug: "lab",
        questionSlug: "q-one",
      },
      content: "Slides",
    },
  },
  {
    name: "invalid fields raise",
    document: {
      ...base,
      kind: "software",
      fields: { title: "No slug" },
      content: "x",
    },
  },
];

const renderer = new MDXRenderer();
const out = [];
for (const { name, document } of cases) {
  try {
    const rendered = await renderer.render(document);
    out.push({ name, document, rendered: { relativePath: rendered.relativePath, content: rendered.content } });
  } catch (error) {
    out.push({ name, document, error: error instanceof Error ? error.message : String(error) });
  }
}
process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
