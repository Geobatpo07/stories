import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildKnowledgeGraph } from "@/kernel/pipeline/graph";
import { createEntity } from "@/kernel/pipeline/factory";
import { discoverSourceFiles } from "@/kernel/pipeline/discovery";
import { normalizeFrontmatter } from "@/kernel/pipeline/normalization";
import { resolveRelationships } from "@/kernel/pipeline/relationships";
import { validateFrontmatter } from "@/kernel/pipeline/validation";
import { MarkdownParser } from "@/kernel/parsers/markdown-parser";
import { registrations } from "@/kernel/registry/registrations";
import { manifestBuildTarget } from "../../build/targets/manifest-target";

// Phase 3 build contract (ADR-004). The real TypeScript pipeline is the reference:
//  - content-hashes.json: the `contentHash` the real manifestBuildTarget computes for each
//    scenario, which the Python pipeline must reproduce exactly;
//  - id-collation.json: entity ids ordered by Node's real `localeCompare`, which pins the claim
//    that UTF-8 byte order is an equivalent collation for the `[a-z0-9:-]` id alphabet.
// Regenerate with: UPDATE_GOLDEN=1 npx vitest run fixtures/build-contract
const HERE = __dirname;
const UPDATE = process.env.UPDATE_GOLDEN === "1";
const SCENARIOS = join(HERE, "..", "kernel-contract", "scenarios");

const temporary: string[] = [];
afterAll(async () => {
  await Promise.all(temporary.map((dir) => rm(dir, { recursive: true, force: true })));
});

function loadScenario(root: string) {
  const parser = new MarkdownParser();
  const entities = registrations.flatMap((registration) => {
    const rooted = { ...registration, contentDir: join(root, registration.contentDir) };
    return discoverSourceFiles(rooted, parser).map((sourcePath) => {
      const parsed = parseOne(parser, sourcePath);
      return createEntity(
        rooted,
        parsed,
        normalizeFrontmatter(validateFrontmatter(parsed, rooted)),
      );
    });
  });
  return resolveRelationships(entities, registrations);
}

function parseOne(parser: MarkdownParser, sourcePath: string) {
  return parser.parse(sourcePath);
}

async function realContentHash(root: string): Promise<string> {
  const entities = loadScenario(root);
  const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-contract-"));
  temporary.push(outputDirectory);
  const context = {
    entities,
    graph: buildKnowledgeGraph(entities),
    outputDirectory,
    artifacts: new Map([["knowledgeDatabase", { file: "x", checksum: "x" }]]),
    startedAt: Date.now(),
  };
  const outcome = await manifestBuildTarget.run(context);
  expect(outcome.success).toBe(true);
  const manifest = JSON.parse(readFileSync(join(outputDirectory, "manifest.json"), "utf8")) as {
    contentHash: string;
  };
  return manifest.contentHash;
}

describe("contentHash golden", () => {
  const goldenPath = join(HERE, "content-hashes.json");
  it("matches the committed hashes for every loadable scenario", async () => {
    const actual: Record<string, string> = {};
    for (const name of readdirSync(SCENARIOS)
      .filter((n) => n.startsWith("ok-"))
      .sort()) {
      if (name === "ok-duplicate-slug") continue; // the Python pipeline rejects it; no artifact exists
      actual[name] = await realContentHash(join(SCENARIOS, name));
    }
    if (UPDATE) writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`, "utf8");
    expect(existsSync(goldenPath), "run with UPDATE_GOLDEN=1 to create the golden").toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, "utf8")));
  });
});

describe("id collation", () => {
  const goldenPath = join(HERE, "id-collation.json");
  const kinds = [
    "program",
    "question",
    "hypothesis",
    "note",
    "experiment",
    "software",
    "publication",
    "dataset",
    "presentation",
  ];
  // Slugs chosen to stress digit/hyphen/prefix ordering inside the legal alphabet.
  const slugs = [
    "a",
    "a-b",
    "a-1",
    "a1",
    "a-b-c",
    "ab",
    "abc",
    "b",
    "z",
    "0",
    "1",
    "10",
    "2",
    "1-0",
    "1-a",
    "a-0",
    "a0",
    "a-z",
    "az",
    "x-1-y",
    "x1y",
    "m",
    "m-m",
    "mm",
    "q-one",
    "q-two",
    "q1",
    "q10",
    "q2",
  ];
  const ids = kinds.flatMap((kind) => slugs.map((slug) => `${kind}:${slug}`));

  it("Node localeCompare orders legal ids exactly like UTF-8 byte order", () => {
    const byLocale = [...ids].sort((a, b) => a.localeCompare(b));
    const byBytes = [...ids].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
    expect(byLocale).toEqual(byBytes);
    if (UPDATE) {
      writeFileSync(goldenPath, `${JSON.stringify(byLocale, null, 2)}\n`, "utf8");
    }
    expect(byLocale).toEqual(JSON.parse(readFileSync(goldenPath, "utf8")));
  });
});
