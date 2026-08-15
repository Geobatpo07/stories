import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import { ArtifactKnowledgeSourceAdapter } from "@/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { duckDBBuildTarget } from "./duckdb-target";
import { manifestBuildTarget } from "./manifest-target";
import type { BuildTargetContext } from "./types";

/**
 * Locks the producer (this pipeline) and consumer
 * (runtime/adapters/artifact-knowledge-source-adapter.ts) contracts
 * together in one test, so a future change to either side that breaks the
 * other fails here first — not at Runtime boot in production.
 */
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
  content: "Program body",
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

describe("DuckDB + Manifest targets round-tripped through ArtifactKnowledgeSourceAdapter", () => {
  it("reads back the same entities and relationships that were written", async () => {
    // Mirrors runBuildPipeline()'s own layout: targets write under
    // <rootDirectory>/database/generated, and the manifest records the
    // database path relative to rootDirectory — not to outputDirectory.
    const rootDirectory = await mkdtemp(join(tmpdir(), "stories-build-roundtrip-"));
    directories.push(rootDirectory);
    const context: BuildTargetContext = {
      entities: [program, question],
      graph: stubGraph,
      outputDirectory: join(rootDirectory, "database/generated"),
      artifacts: new Map(),
      startedAt: Date.now(),
    };

    const duckdbOutcome = await duckDBBuildTarget.run(context);
    expect(duckdbOutcome.success).toBe(true);
    const manifestOutcome = await manifestBuildTarget.run(context);
    expect(manifestOutcome.success).toBe(true);

    const adapter = await ArtifactKnowledgeSourceAdapter.create({
      manifestPath: join(rootDirectory, "database/generated/manifest.json"),
      rootDirectory,
    });

    const entities = adapter.loadAll();
    expect(entities.map((entity) => entity.id).sort()).toEqual(["program:lab", "question:test"]);
    expect(adapter.getMetadata().knowledge).toEqual({ entities: 2, relationships: 1 });
    expect(
      adapter
        .getGraph()
        .getParents("question:test")
        .map((entity) => entity.id),
    ).toEqual(["program:lab"]);
    expect(
      adapter
        .getGraph()
        .getChildren("program:lab")
        .map((entity) => entity.id),
    ).toEqual(["question:test"]);

    const rehydratedProgram = entities.find((entity) => entity.id === "program:lab");
    expect(rehydratedProgram?.title).toBe(program.title);
    expect(rehydratedProgram?.content).toBe(program.content);
    expect((rehydratedProgram as unknown as { theme?: string })?.theme).toBe("physics");
  });
});
