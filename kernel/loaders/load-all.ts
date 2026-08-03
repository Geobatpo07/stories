import { createMemoized } from "../cache";
import { createEntity } from "../pipeline/factory";
import { discoverSourceFiles } from "../pipeline/discovery";
import { normalizeFrontmatter } from "../pipeline/normalization";
import { parseSource } from "../pipeline/parsing";
import { resolveRelationships } from "../pipeline/relationships";
import { validateFrontmatter } from "../pipeline/validation";
import { MarkdownParser } from "../parsers/markdown-parser";
import type { Parser } from "../parsers/parser";
import { registrations } from "../registry/registrations";
import type { KnowledgeEntity } from "../types";

const parser: Parser = new MarkdownParser();

function loadAllUncached(): readonly (KnowledgeEntity & Record<string, unknown>)[] {
  const entities = registrations.flatMap((registration) =>
    discoverSourceFiles(registration, parser).map((sourcePath) => {
      const parsed = parseSource(sourcePath, parser);
      const validated = validateFrontmatter(parsed, registration);
      const normalized = normalizeFrontmatter(validated);
      return createEntity(registration, parsed, normalized);
    }),
  );

  return resolveRelationships(entities, registrations);
}

const memoized = createMemoized(loadAllUncached);

/**
 * The single closed-world orchestrator: runs every registration through
 * Discovery → Loading/Parsing → Validation → Normalization → Domain
 * Factory, then resolves relationships across the whole loaded set.
 * Memoized — call `resetKernelCache()` (from `kernel/cache.ts`, exposed
 * on the Public API) to force a fresh load, e.g. between tests.
 */
export function loadAll(): readonly (KnowledgeEntity & Record<string, unknown>)[] {
  return memoized.get();
}
