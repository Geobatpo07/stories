import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownParser } from "./markdown-parser";

describe("MarkdownParser", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it("discovers only .mdx/.md files, ignoring other extensions", () => {
    dir = mkdtempSync(join(tmpdir(), "kernel-parser-"));
    writeFileSync(join(dir, "a.mdx"), "---\ntitle: A\n---\nbody");
    writeFileSync(join(dir, "b.md"), "---\ntitle: B\n---\nbody");
    writeFileSync(join(dir, "notes.txt"), "not content");

    const files = new MarkdownParser().discover(dir);

    expect(files).toHaveLength(2);
    expect(files.every((file) => file.endsWith(".mdx") || file.endsWith(".md"))).toBe(true);
  });

  it("falls back to a filename-derived slug when frontmatter has no slug", () => {
    dir = mkdtempSync(join(tmpdir(), "kernel-parser-"));
    const filePath = join(dir, "my-file.mdx");
    writeFileSync(filePath, "---\ntitle: Something\n---\nBody text");

    const parsed = new MarkdownParser().parse(filePath);

    expect(parsed.slug).toBe("my-file");
    expect(parsed.content).toBe("Body text");
  });

  it("uses frontmatter.slug when present, ignoring the filename", () => {
    dir = mkdtempSync(join(tmpdir(), "kernel-parser-"));
    const filePath = join(dir, "irrelevant-name.mdx");
    writeFileSync(filePath, "---\ntitle: Something\nslug: explicit-slug\n---\nBody");

    const parsed = new MarkdownParser().parse(filePath);

    expect(parsed.slug).toBe("explicit-slug");
  });

  it("returns raw, unvalidated data — no schema is applied at this stage", () => {
    dir = mkdtempSync(join(tmpdir(), "kernel-parser-"));
    const filePath = join(dir, "invalid.mdx");
    writeFileSync(filePath, "---\nslug: x\n---\nBody");

    const parsed = new MarkdownParser().parse(filePath);

    expect(parsed.data).toEqual({ slug: "x" });
  });
});
