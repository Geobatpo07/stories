import type { ZodError } from "zod";
import type { BaseFrontmatter } from "@/schemas";
import { KnowledgeValidationError } from "../errors";
import type { ParsedSource } from "../parsers/parser";
import type { EntityRegistration } from "../registry/types";

/**
 * Validation stage: parse raw frontmatter against the registration's Zod
 * schema. Never lets a raw `ZodError` escape — always rethrown as a
 * `KnowledgeValidationError` naming the file, field, and a fix hint.
 */
export function validateFrontmatter(
  parsed: ParsedSource,
  registration: EntityRegistration,
): BaseFrontmatter {
  const result = registration.schema.safeParse(parsed.data);
  if (!result.success) {
    throw new KnowledgeValidationError(parsed.sourcePath, result.error as ZodError);
  }
  return result.data;
}
