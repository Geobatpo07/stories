import { describe, expect, it } from "vitest";
import { baseFrontmatterSchema } from "@/schemas";
import { KnowledgeValidationError } from "../errors";
import type { ParsedSource } from "../parsers/parser";
import type { EntityRegistration } from "../registry/types";
import { validateFrontmatter } from "./validation";

const registration: EntityRegistration = {
  kind: "note",
  contentDir: "content/notes",
  schema: baseFrontmatterSchema,
  relationshipFields: [],
};

function parsed(data: unknown): ParsedSource {
  return { slug: "x", data, content: "", sourcePath: "content/notes/x.mdx" };
}

function captureError(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("validateFrontmatter", () => {
  it("returns validated frontmatter for valid data", () => {
    const result = validateFrontmatter(
      parsed({
        title: "Title",
        slug: "x",
        description: "desc",
        date: "2025-01-01",
        status: "draft",
        tags: [],
      }),
      registration,
    );
    expect(result.title).toBe("Title");
  });

  it("throws KnowledgeValidationError (not a raw ZodError) naming the file and the missing field", () => {
    const error = captureError(() =>
      validateFrontmatter(
        parsed({ slug: "x", description: "desc", date: "2025-01-01" }),
        registration,
      ),
    );

    expect(error).toBeInstanceOf(KnowledgeValidationError);
    const validationError = error as KnowledgeValidationError;
    expect(validationError.filePath).toBe("content/notes/x.mdx");
    expect(validationError.issues.some((issue) => issue.path === "title")).toBe(true);
    expect(validationError.message).toContain("content/notes/x.mdx");
  });

  it("lists the allowed values as the hint for an invalid enum value", () => {
    const error = captureError(() =>
      validateFrontmatter(
        parsed({
          title: "T",
          slug: "x",
          description: "d",
          date: "2025-01-01",
          status: "in-progress",
          tags: [],
        }),
        registration,
      ),
    ) as KnowledgeValidationError;

    const statusIssue = error.issues.find((issue) => issue.path === "status");
    expect(statusIssue?.hint).toContain("draft");
  });
});
