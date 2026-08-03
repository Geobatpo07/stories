import type { ZodError, ZodIssue } from "zod";

/** A content file could not be read or its raw source could not be parsed (e.g. malformed YAML). */
export class KnowledgeParseError extends Error {
  constructor(
    readonly filePath: string,
    cause: unknown,
  ) {
    super(
      `Failed to read or parse "${filePath}": ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "KnowledgeParseError";
  }
}

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
  readonly hint: string;
}

/**
 * A content file's frontmatter failed Zod validation. Wraps the raw
 * `ZodError` into a message that names the file, the exact field, what's
 * wrong, and how to fix it — the Kernel never lets a raw ZodError or stack
 * trace reach a caller.
 */
export class KnowledgeValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(
    readonly filePath: string,
    zodError: ZodError,
  ) {
    const issues = zodError.issues.map((issue) => buildIssue(issue));
    const body = issues
      .map((issue) => `  - ${issue.path}: ${issue.message} (${issue.hint})`)
      .join("\n");
    super(`Invalid frontmatter in "${filePath}":\n${body}`);
    this.name = "KnowledgeValidationError";
    this.issues = issues;
  }
}

function buildIssue(issue: ZodIssue): ValidationIssue {
  return {
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
    hint: buildHint(issue),
  };
}

function buildHint(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
      return issue.received === "undefined"
        ? "this field is required"
        : `expected ${issue.expected}, received ${issue.received}`;
    case "too_small":
      return issue.type === "string"
        ? `must be at least ${issue.minimum} character(s)`
        : `must be at least ${issue.minimum}`;
    case "invalid_string":
      return "check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)";
    case "invalid_enum_value":
      return `must be one of: ${issue.options.join(", ")}`;
    default:
      return "see the field's schema for the expected shape";
  }
}

/** A `*Slug`/`*Slugs` frontmatter field points at an entity that does not exist. */
export class KnowledgeRelationshipError extends Error {
  constructor(
    readonly sourceId: string,
    readonly field: string,
    readonly danglingTargetId: string,
  ) {
    super(
      `Entity "${sourceId}" has a dangling reference in "${field}": target "${danglingTargetId}" does not exist.`,
    );
    this.name = "KnowledgeRelationshipError";
  }
}

/** `findById`/`findBySlug` (in strict/throwing form) found no matching entity. */
export class KnowledgeNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`No knowledge entity found with id "${id}".`);
    this.name = "KnowledgeNotFoundError";
  }
}
