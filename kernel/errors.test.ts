import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  KnowledgeNotFoundError,
  KnowledgeParseError,
  KnowledgeRelationshipError,
  KnowledgeValidationError,
} from "./errors";

describe("KnowledgeValidationError", () => {
  it("formats two simultaneous issues as one multi-line list, one line per field with a hint", () => {
    const schema = z.object({
      title: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const result = schema.safeParse({ date: "not-a-date" });
    if (result.success) throw new Error("expected validation failure in test setup");

    const error = new KnowledgeValidationError("content/notes/x.mdx", result.error);

    expect(error.message).toContain("content/notes/x.mdx");
    expect(error.issues).toHaveLength(2);
    expect(error.issues.map((issue) => issue.path).sort()).toEqual(["date", "title"]);
    expect(error.issues.every((issue) => issue.hint.length > 0)).toBe(true);
  });
});

describe("KnowledgeRelationshipError", () => {
  it("names the source id, field, and dangling target id", () => {
    const error = new KnowledgeRelationshipError(
      "question:y",
      "programSlug",
      "program:does-not-exist",
    );

    expect(error.message).toContain("question:y");
    expect(error.message).toContain("programSlug");
    expect(error.message).toContain("program:does-not-exist");
  });
});

describe("KnowledgeNotFoundError", () => {
  it("names the missing id", () => {
    expect(new KnowledgeNotFoundError("program:nope").message).toContain("program:nope");
  });
});

describe("KnowledgeParseError", () => {
  it("wraps the underlying cause's message and names the file path", () => {
    const error = new KnowledgeParseError("content/x.mdx", new Error("ENOENT"));

    expect(error.message).toContain("content/x.mdx");
    expect(error.message).toContain("ENOENT");
  });
});
