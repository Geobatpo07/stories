import { readFileSync } from "node:fs";
import { basename } from "node:path";
import matter from "gray-matter";
import type { z } from "zod";
import type { ContentFile } from "./types";

/**
 * Read one content file and validate its frontmatter against the given Zod
 * schema. This is the single choke point every content type flows through —
 * a malformed note fails fast, here, with a Zod error pointing at the exact
 * field, rather than surfacing as a runtime bug in a page component.
 *
 * `content` is returned as raw MDX source; compiling it to React is a
 * rendering concern for the route/component that needs it, not this
 * function's job.
 */
export function readContentFile<TSchema extends z.ZodTypeAny>(
  filePath: string,
  schema: TSchema,
): ContentFile<z.infer<TSchema>> {
  const raw = readFileSync(filePath, "utf-8");
  const { data, content } = matter(raw);
  const frontmatter = schema.parse(data) as z.infer<TSchema>;
  const slug = extractSlug(frontmatter, filePath);

  return { slug, frontmatter, content: content.trim(), filePath };
}

function extractSlug(frontmatter: unknown, filePath: string): string {
  if (
    typeof frontmatter === "object" &&
    frontmatter !== null &&
    "slug" in frontmatter &&
    typeof (frontmatter as { slug: unknown }).slug === "string"
  ) {
    return (frontmatter as { slug: string }).slug;
  }
  return basename(filePath).replace(/\.mdx?$/, "");
}
