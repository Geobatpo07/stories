import { randomUUID } from "node:crypto";
import type { IdentifierPort } from "../ports/types";

/**
 * `normalizeSlug` transforms an arbitrary string into a valid slug; it is
 * distinct from `schemas/common.ts`'s `slugSchema`, which only *validates*
 * an already-slug-shaped string. Runtime-internal utility — `schemas/` is
 * untouched.
 */
export class IdentifierService implements IdentifierPort {
  generateId(): string {
    return randomUUID();
  }

  normalizeSlug(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
