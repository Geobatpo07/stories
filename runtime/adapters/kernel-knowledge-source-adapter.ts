import {
  getKnowledgeGraph,
  loadEverything,
  type KnowledgeEntity,
  type KnowledgeGraph,
} from "@/kernel";
import type { KnowledgeSourcePort } from "../ports/types";

/**
 * The Runtime's sole `KnowledgeSourcePort` implementation this sprint.
 *
 * IMPORTANT: this adapter does NOT parse Markdown, discover content files,
 * or validate frontmatter. All of that is owned by the sealed Knowledge
 * Kernel (`@/kernel`) per Sprint 2's architecture — kernel/README.md
 * forbids duplicating or bypassing it, and this sprint's brief forbids
 * modifying it. This class exists purely so the Runtime depends on an
 * abstraction (`KnowledgeSourcePort`) instead of a concrete module — the
 * seam it buys is a FUTURE one: a different Kernel instance, or an
 * entirely different knowledge backend, could implement
 * `KnowledgeSourcePort` without the Runtime changing. This sprint, "the
 * knowledge source" IS the Knowledge Kernel, reached only through its
 * public barrel `@/kernel` — never `@/kernel/*` internals. This is the
 * ONE file in `runtime/` permitted to import from `@/kernel`.
 */
export class KernelKnowledgeSourceAdapter implements KnowledgeSourcePort {
  loadAll(): readonly KnowledgeEntity[] {
    return loadEverything();
  }

  getGraph(): KnowledgeGraph {
    return getKnowledgeGraph();
  }
}
