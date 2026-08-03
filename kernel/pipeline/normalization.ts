import type { BaseFrontmatter } from "@/schemas";

/**
 * Normalization stage: canonicalize validated frontmatter before it
 * reaches the Domain Factory. Today this only dedupes/sorts `tags`.
 * Extension point: slug canonicalization, body trimming rules, etc. —
 * not needed yet, so not added speculatively.
 */
export function normalizeFrontmatter<T extends BaseFrontmatter>(frontmatter: T): T {
  return { ...frontmatter, tags: dedupeSorted(frontmatter.tags) };
}

function dedupeSorted(tags: readonly string[]): string[] {
  return Array.from(new Set(tags)).sort();
}
