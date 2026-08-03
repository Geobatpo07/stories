import type { z } from "zod";
import type { BaseFrontmatter } from "@/schemas";
import type { EntityKind } from "../types";

export interface RelationshipFieldSpec {
  /** Frontmatter field name, e.g. "programSlug" or "relatedQuestionSlugs". */
  readonly field: string;
  readonly cardinality: "one" | "many";
  readonly targetKind: EntityKind;
}

/**
 * Everything the Kernel needs to know about one entity kind, and the
 * ONLY place any per-entity-type knowledge lives. Discovery, Validation,
 * the Domain Factory, and Relationship Resolution all loop over a list of
 * these instead of hardcoding branches per kind — see
 * `kernel/registry/registrations.ts` and `kernel/README.md`.
 */
export interface EntityRegistration<TFrontmatter extends BaseFrontmatter = BaseFrontmatter> {
  readonly kind: EntityKind;
  /** Path to the collection directory, relative to the repo root. */
  readonly contentDir: string;
  /**
   * `Input` is pinned to `unknown` (not `TFrontmatter`) so any concrete
   * `domain/*\/schema.ts` schema — whose Zod *input* type has optional
   * defaulted fields (e.g. `status?`) while its *output* type does not —
   * can be assigned here without a variance error. Every call site parses
   * genuinely unknown data (`schema.safeParse(parsed.data)`) anyway.
   */
  readonly schema: z.ZodType<TFrontmatter, z.ZodTypeDef, unknown>;
  readonly relationshipFields: readonly RelationshipFieldSpec[];
}
