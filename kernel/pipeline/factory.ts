import { baseFrontmatterSchema, type BaseFrontmatter } from "@/schemas";
import type { ParsedSource } from "../parsers/parser";
import type { EntityRegistration } from "../registry/types";
import type { KnowledgeEntity } from "../types";

const BASE_FIELDS = new Set(Object.keys(baseFrontmatterSchema.shape));

/**
 * Domain Factory: turns validated frontmatter into a `KnowledgeEntity`.
 * Generic and registry-driven — there is no per-kind factory function.
 * Fields declared on `baseFrontmatterSchema` are promoted to their named
 * `KnowledgeEntity` slot; every other validated field (computed generically
 * as "not a base field," never listed per kind) is spread onto the result,
 * which is exactly what lets `domain/*\/types.ts`'s per-kind entity aliases
 * (`Pick<XFrontmatter, "theme" | ...>`) work.
 */
export function createEntity(
  registration: EntityRegistration,
  parsed: ParsedSource,
  frontmatter: BaseFrontmatter,
): KnowledgeEntity & Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!BASE_FIELDS.has(key)) {
      extra[key] = value;
    }
  }

  return {
    id: `${registration.kind}:${frontmatter.slug}`,
    kind: registration.kind,
    slug: frontmatter.slug,
    title: frontmatter.title,
    summary: frontmatter.description,
    status: frontmatter.status,
    createdAt: frontmatter.date,
    updatedAt: frontmatter.date,
    metadata: Object.freeze({ tags: frontmatter.tags }),
    relationships: [],
    content: parsed.content,
    filePath: parsed.sourcePath,
    ...extra,
  };
}
