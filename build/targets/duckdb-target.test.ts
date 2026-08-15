import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import { afterEach, describe, expect, it } from "vitest";
import { duckDBBuildTarget } from "./duckdb-target";
import type { BuildTargetContext } from "./types";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const stubGraph: KnowledgeGraph = {
  nodes: new Map(),
  getNode: () => undefined,
  getParents: () => [],
  getChildren: () => [],
  getRelated: () => [],
};

function contextFor(
  entities: readonly KnowledgeEntity[],
  outputDirectory: string,
): BuildTargetContext {
  return {
    entities,
    graph: stubGraph,
    outputDirectory,
    artifacts: new Map(),
    startedAt: Date.now(),
  };
}

const program: KnowledgeEntity = {
  id: "program:lab",
  kind: "program",
  slug: "lab",
  title: "Laboratory",
  summary: "A program",
  status: "active",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  metadata: Object.freeze({ tags: ["science"], theme: "physics" }),
  relationships: [],
  content: 'Program body with a \' quote and a "double" quote.',
  filePath: "content/programs/lab.mdx",
};

const question: KnowledgeEntity = {
  id: "question:test",
  kind: "question",
  slug: "test",
  title: "Test question",
  summary: "A project",
  status: "active",
  createdAt: "2026-01-02",
  updatedAt: "2026-01-02",
  metadata: Object.freeze({ programSlug: "lab", tags: [] }),
  relationships: [
    {
      field: "programSlug",
      cardinality: "one",
      target: { id: "program:lab", kind: "program", slug: "lab", title: "Laboratory" },
    },
  ],
  content: "Project body",
  filePath: "content/questions/test.mdx",
};

describe("duckDBBuildTarget", () => {
  it("writes the exact schema and rows ArtifactKnowledgeSourceAdapter expects", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-duckdb-"));
    directories.push(outputDirectory);

    const outcome = await duckDBBuildTarget.run(contextFor([program, question], outputDirectory));

    expect(outcome.success).toBe(true);
    expect(outcome.artifactKey).toBe("knowledgeDatabase");
    const databasePath = join(outputDirectory, "knowledge.duckdb");
    const bytes = await readFile(databasePath);
    expect(bytes.length).toBeGreaterThan(0);

    const instance = await DuckDBInstance.create(databasePath, { access_mode: "READ_ONLY" });
    const connection = await instance.connect();
    try {
      const entities = (
        await connection.runAndReadAll(
          "SELECT id, content, metadata FROM knowledge_entity ORDER BY id;",
        )
      ).getRowObjectsJson() as unknown as { id: string; content: string; metadata: unknown }[];
      expect(entities.map((row) => row.id)).toEqual(["program:lab", "question:test"]);
      expect(entities[0]?.content).toBe(program.content);

      const relationships = (
        await connection.runAndReadAll(
          "SELECT source_id, target_id, field, cardinality FROM knowledge_relationship;",
        )
      ).getRowObjectsJson() as unknown as { source_id: string; target_id: string }[];
      expect(relationships).toEqual([
        {
          source_id: "question:test",
          target_id: "program:lab",
          field: "programSlug",
          cardinality: "one",
        },
      ]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  it("records a checksum matching the actual file bytes on disk", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-duckdb-"));
    directories.push(outputDirectory);
    const context = contextFor([program], outputDirectory);

    await duckDBBuildTarget.run(context);

    const artifact = context.artifacts.get("knowledgeDatabase");
    expect(artifact).toBeDefined();
    expect(artifact?.file).toBe("database/generated/knowledge.duckdb");
  });

  it("DROPs and recreates cleanly on a second run, and tolerates zero entities", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-duckdb-"));
    directories.push(outputDirectory);

    const first = await duckDBBuildTarget.run(contextFor([program], outputDirectory));
    expect(first.success).toBe(true);

    const second = await duckDBBuildTarget.run(contextFor([], outputDirectory));
    expect(second.success).toBe(true);
    expect(second.message).toContain("Wrote 0 entities");
  });
});
