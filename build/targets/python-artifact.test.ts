import { cpSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { ArtifactKnowledgeSourceAdapter } from "@/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { pythonAvailable, runPythonBuild } from "./python-producer.test-support";

/**
 * ADR-004 Phase 3, the standing producer/consumer check: the Python pipeline (backend/pipeline)
 * writes `knowledge.duckdb` + `manifest.json` from real content files, and the real Node reader
 * (`@duckdb/node-api` through ArtifactKnowledgeSourceAdapter) must accept and understand them.
 * This is also the CI guard against DuckDB storage-format skew between the two pinned packages:
 * it runs on every CI build and fails if either side is bumped to an incompatible version.
 */
const SCENARIOS = join(__dirname, "..", "..", "fixtures", "kernel-contract", "scenarios");

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function rootWithScenario(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "stories-python-artifact-"));
  directories.push(root);
  cpSync(join(SCENARIOS, name, "content"), join(root, "content"), { recursive: true });
  return root;
}

describe.skipIf(!pythonAvailable)("Python-built artifact read by the real Node reader", () => {
  it("is accepted by ArtifactKnowledgeSourceAdapter, with kind-specific fields and the graph intact", async () => {
    const root = await rootWithScenario("ok-full");
    const built = runPythonBuild(root);
    expect(built.stderr).toBe("");
    expect(built.status).toBe(0);

    const adapter = await ArtifactKnowledgeSourceAdapter.create({
      manifestPath: join(root, "database/generated/manifest.json"),
      rootDirectory: root,
    });
    expect(adapter.getMetadata().knowledge).toEqual({ entities: 15, relationships: 11 });

    const program = adapter.loadAll().find((entity) => entity.id === "program:lab") as unknown as
      Record<string, unknown> | undefined;
    expect(program?.theme).toBe("Climate");
    expect(program?.leadResearcher).toBe("A. Person");

    const graph = adapter.getGraph();
    expect(
      graph
        .getParents("question:q-one")
        .map((entity) => entity.id)
        .sort(),
    ).toEqual(["program:lab"]);
    expect(
      graph
        .getChildren("program:lab")
        .map((entity) => entity.id)
        .sort(),
    ).toEqual(["note:n-one", "presentation:t-one", "question:q-one", "question:q-two"]);
  });

  it("carries graph-derived search signals in the same static file", async () => {
    const root = await rootWithScenario("ok-full");
    expect(runPythonBuild(root).status).toBe(0);

    const instance = await DuckDBInstance.create(
      join(root, "database/generated/knowledge.duckdb"),
      {
        access_mode: "READ_ONLY",
      },
    );
    const connection = await instance.connect();
    try {
      const top = (
        await connection.runAndReadAll(
          "SELECT related_id, score, hops FROM knowledge_search_related WHERE entity_id = 'program:lab' ORDER BY score DESC, related_id LIMIT 1",
        )
      ).getRowObjectsJson();
      expect(top).toHaveLength(1);
      expect(Number(top[0]?.score)).toBeGreaterThan(1);
      const stats = (
        await connection.runAndReadAll(
          "SELECT in_degree, out_degree FROM knowledge_search_stats WHERE entity_id = 'program:lab'",
        )
      ).getRowObjectsJson();
      expect(stats).toEqual([{ in_degree: 4, out_degree: 2 }]);
    } finally {
      connection.closeSync();
      instance.closeSync();
    }
  });

  it("builds an empty laboratory", async () => {
    const root = await rootWithScenario("ok-empty");
    expect(runPythonBuild(root).status).toBe(0);
    const adapter = await ArtifactKnowledgeSourceAdapter.create({
      manifestPath: join(root, "database/generated/manifest.json"),
      rootDirectory: root,
    });
    expect(adapter.loadAll()).toEqual([]);
  });

  it("refuses a duplicate id, naming both files, and writes no artifact", async () => {
    const root = await rootWithScenario("ok-duplicate-slug");
    const built = runPythonBuild(root);
    expect(built.status).toBe(1);
    expect(built.stderr).toContain("[duplicate-id]");
    expect(built.stderr).toContain("content/datasets/a-first.mdx");
    expect(built.stderr).toContain("content/datasets/b-second.mdx");
    await expect(
      ArtifactKnowledgeSourceAdapter.create({
        manifestPath: join(root, "database/generated/manifest.json"),
        rootDirectory: root,
      }),
    ).rejects.toThrow();
  });
});
