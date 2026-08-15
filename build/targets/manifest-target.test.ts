import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgeEntity, KnowledgeGraph } from "@/kernel";
import { afterEach, describe, expect, it } from "vitest";
import { manifestBuildTarget } from "./manifest-target";
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

const program: KnowledgeEntity = {
  id: "program:lab",
  kind: "program",
  slug: "lab",
  title: "Laboratory",
  summary: "A program",
  status: "active",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  metadata: Object.freeze({ tags: ["science"] }),
  relationships: [],
  content: "Program body",
  filePath: "content/programs/lab.mdx",
};

async function contextWithArtifact(outputDirectory: string): Promise<BuildTargetContext> {
  const context: BuildTargetContext = {
    entities: [program],
    graph: stubGraph,
    outputDirectory,
    artifacts: new Map(),
    startedAt: Date.now(),
  };
  context.artifacts.set("knowledgeDatabase", {
    file: "database/generated/knowledge.duckdb",
    checksum: "fixture-checksum",
  });
  return context;
}

describe("manifestBuildTarget", () => {
  it("fails cleanly when no knowledgeDatabase artifact was published", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-manifest-"));
    directories.push(outputDirectory);
    const context: BuildTargetContext = {
      entities: [],
      graph: stubGraph,
      outputDirectory,
      artifacts: new Map(),
      startedAt: Date.now(),
    };

    const outcome = await manifestBuildTarget.run(context);

    expect(outcome.success).toBe(false);
    expect(outcome.message).toContain("knowledgeDatabase");
  });

  it("writes a manifest satisfying the Runtime artifact contract", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-manifest-"));
    directories.push(outputDirectory);
    const context = await contextWithArtifact(outputDirectory);

    const outcome = await manifestBuildTarget.run(context);

    expect(outcome.success).toBe(true);
    const raw = await readFile(join(outputDirectory, "manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    expect(typeof manifest.platformVersion).toBe("string");
    expect(typeof manifest.kernelVersion).toBe("string");
    expect(typeof manifest.buildVersion).toBe("string");
    expect(typeof manifest.schemaVersion).toBe("string");
    expect(typeof manifest.generatedAt).toBe("string");
    expect(typeof manifest.contentHash).toBe("string");
    expect(typeof manifest.generationDuration).toBe("number");
    expect(manifest.knowledge).toEqual({ entities: 1, relationships: 0 });
    expect(manifest.artifacts).toEqual({
      knowledgeDatabase: {
        file: "database/generated/knowledge.duckdb",
        checksum: "fixture-checksum",
      },
    });
  });

  it("produces a stable contentHash for the same entities and a different one when content changes", async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), "stories-build-manifest-"));
    directories.push(outputDirectory);
    const context = await contextWithArtifact(outputDirectory);
    await manifestBuildTarget.run(context);
    const first = JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8")) as {
      contentHash: string;
    };

    const editedContext: BuildTargetContext = {
      ...context,
      entities: [{ ...program, content: "Edited program body" }],
    };
    await manifestBuildTarget.run(editedContext);
    const second = JSON.parse(await readFile(join(outputDirectory, "manifest.json"), "utf8")) as {
      contentHash: string;
    };

    expect(second.contentHash).not.toBe(first.contentHash);
  });
});
