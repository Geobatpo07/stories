import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { datasetSchema } from "@/domain/dataset/schema";
import { experimentSchema } from "@/domain/experiment/schema";
import { hypothesisSchema } from "@/domain/hypothesis/schema";
import { knowledgeObjectTypeSchema, knowledgeSchema } from "@/domain/knowledge/schema";
import { presentationSchema } from "@/domain/presentation/schema";
import { programSchema } from "@/domain/program/schema";
import { publicationSchema } from "@/domain/publication/schema";
import { questionSchema } from "@/domain/question/schema";
import { softwareSchema } from "@/domain/software/schema";
import { contentStatusSchema, contentTypeSchema } from "@/schemas";

// Phase 1 schema contract (ADR-004). The same fixture files are validated by
// backend/tests/test_schema_contract.py against the Pydantic ports.
const FIXTURES = __dirname;

const SCHEMAS = {
  dataset: datasetSchema,
  experiment: experimentSchema,
  hypothesis: hypothesisSchema,
  knowledge: knowledgeSchema,
  presentation: presentationSchema,
  program: programSchema,
  publication: publicationSchema,
  question: questionSchema,
  software: softwareSchema,
} as const;

interface Fixture {
  description: string;
  input: unknown;
  valid: boolean;
  expected?: unknown;
}

describe("vocabulary", () => {
  const vocabulary = JSON.parse(readFileSync(join(FIXTURES, "vocabulary.json"), "utf8"));
  it("matches the Zod enums, in order", () => {
    expect(contentStatusSchema.options).toEqual(vocabulary.contentStatus);
    expect(contentTypeSchema.options).toEqual(vocabulary.contentType);
    expect(knowledgeObjectTypeSchema.options).toEqual(vocabulary.knowledgeObjectType);
  });
});

for (const [kind, schema] of Object.entries(SCHEMAS)) {
  const dir = join(FIXTURES, kind);
  const files = readdirSync(dir).filter((file) => file.endsWith(".json"));
  describe(`${kind} schema contract`, () => {
    it("has fixtures covering both outcomes", () => {
      const outcomes = files.map(
        (file) => (JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture).valid,
      );
      expect(outcomes).toContain(true);
      expect(outcomes).toContain(false);
    });
    for (const file of files) {
      it(file, () => {
        const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as Fixture;
        const result = schema.safeParse(fixture.input);
        expect(result.success, fixture.description).toBe(fixture.valid);
        if (fixture.valid && result.success) {
          expect(result.data).toEqual(fixture.expected);
        }
      });
    }
  });
}
