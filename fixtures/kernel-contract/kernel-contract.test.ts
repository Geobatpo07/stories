import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { KnowledgeValidationError } from "@/kernel/errors";
import { MarkdownParser } from "@/kernel/parsers/markdown-parser";
import { discoverSourceFiles } from "@/kernel/pipeline/discovery";
import { createEntity } from "@/kernel/pipeline/factory";
import { normalizeFrontmatter } from "@/kernel/pipeline/normalization";
import { parseSource } from "@/kernel/pipeline/parsing";
import { resolveRelationships } from "@/kernel/pipeline/relationships";
import { validateFrontmatter } from "@/kernel/pipeline/validation";
import { registrations } from "@/kernel/registry/registrations";
import { datasetSchema } from "@/domain/dataset/schema";
import { experimentSchema } from "@/domain/experiment/schema";
import { hypothesisSchema } from "@/domain/hypothesis/schema";
import { knowledgeSchema } from "@/domain/knowledge/schema";
import { presentationSchema } from "@/domain/presentation/schema";
import { programSchema } from "@/domain/program/schema";
import { publicationSchema } from "@/domain/publication/schema";
import { questionSchema } from "@/domain/question/schema";
import { softwareSchema } from "@/domain/software/schema";

// Phase 2 Kernel contract (ADR-004). The real TypeScript Kernel is the reference: its output
// for each scenario is the committed `expected.json`, which backend/tests/test_kernel_contract.py
// asserts the Python port against. Regenerate with:
//   UPDATE_GOLDEN=1 npx vitest run fixtures/kernel-contract
const HERE = __dirname;
const UPDATE = process.env.UPDATE_GOLDEN === "1";
const SCENARIOS = join(HERE, "scenarios");

const toPosix = (value: string) => value.split(sep).join("/");

/** Mirrors `loadAll()` stage-for-stage, but rooted at a scenario directory instead of cwd. */
function runKernel(root: string) {
  const parser = new MarkdownParser();
  const entities = registrations.flatMap((registration) => {
    const rooted = { ...registration, contentDir: join(root, registration.contentDir) };
    return discoverSourceFiles(rooted, parser).map((sourcePath) => {
      const parsed = parseSource(sourcePath, parser);
      const validated = validateFrontmatter(parsed, rooted);
      const normalized = normalizeFrontmatter(validated);
      return createEntity(rooted, parsed, normalized);
    });
  });
  return resolveRelationships(entities, registrations);
}

function snapshot(root: string): unknown {
  const rel = (path: string) => toPosix(relative(root, path));
  try {
    const entities = runKernel(root).map((entity) => ({
      ...entity,
      filePath: rel(entity.filePath),
    }));
    return { outcome: "ok", entities: JSON.parse(JSON.stringify(entities)) };
  } catch (error) {
    const e = error as Error & Record<string, unknown>;
    const base = { name: e.name } as Record<string, unknown>;
    if (e.name === "KnowledgeValidationError") {
      base.filePath = rel(e.filePath as string);
      base.issues = e.issues;
    } else if (e.name === "KnowledgeParseError") {
      base.filePath = rel(e.filePath as string); // message embeds the YAML library's text: not compared
    } else if (e.name === "KnowledgeRelationshipError") {
      base.sourceId = e.sourceId;
      base.field = e.field;
      base.danglingTargetId = e.danglingTargetId;
      base.message = e.message;
    } else {
      throw error;
    }
    return { outcome: "error", error: base };
  }
}

describe("kernel pipeline scenarios", () => {
  for (const name of readdirSync(SCENARIOS).sort()) {
    it(name, () => {
      const actual = snapshot(join(SCENARIOS, name));
      const goldenPath = join(SCENARIOS, name, "expected.json");
      if (UPDATE) writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
      expect(existsSync(goldenPath), "run with UPDATE_GOLDEN=1 to create the golden file").toBe(
        true,
      );
      expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, "utf8")));
    });
  }
});

// Validation-issue contract: every Phase 1 fixture, run through the Kernel's own
// KnowledgeValidationError, must yield the same {path, message, hint} issues from Python.
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

describe("validation issue contract", () => {
  const goldenPath = join(HERE, "validation-issues.json");
  const contractDir = join(HERE, "..", "schema-contract");
  const actual: Record<string, unknown> = {};
  for (const [kind, schema] of Object.entries(SCHEMAS)) {
    const dir = join(contractDir, kind);
    for (const file of readdirSync(dir)
      .filter((f) => f.startsWith("invalid-"))
      .sort()) {
      const fixture = JSON.parse(readFileSync(join(dir, file), "utf8")) as { input: unknown };
      const result = schema.safeParse(fixture.input);
      if (result.success) throw new Error(`${kind}/${file} unexpectedly valid`);
      actual[`${kind}/${file.replace(/\.json$/, "")}`] = new KnowledgeValidationError(
        "f.mdx",
        result.error,
      ).issues;
    }
  }
  it("matches the committed golden issues", () => {
    if (UPDATE) writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
    expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, "utf8")));
  });
});
