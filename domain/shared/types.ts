import type { Slug } from "@/schemas";

/** A typed reference to another entity, used for cross-linking (e.g. a Question's `programSlug`). */
export interface EntityRef {
  readonly slug: Slug;
}

/**
 * Standard shape for a service operation that can fail without throwing.
 * Not used by any service yet — reserved for `domain/*\/service.ts` once
 * business logic ships, so every module reports failure the same way.
 */
export type Result<TValue, TError = string> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: TError };
