import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactKnowledgeSourceAdapter } from "./artifact-knowledge-source-adapter";

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("ArtifactKnowledgeSourceAdapter", () => {
  it("hydrates entities, graph relationships, and manifest metadata without the Kernel", async () => {
    const root = await mkdtemp(join(tmpdir(), "stories-runtime-"));
    temporaryDirectories.push(root);
    const databasePath = join(root, "knowledge.duckdb");
    const manifestPath = join(root, "manifest.json");
    const instance = await DuckDBInstance.create(databasePath);
    const connection = await instance.connect();
    await connection.run(
      `CREATE TABLE knowledge_entity (id VARCHAR, kind VARCHAR, slug VARCHAR, title VARCHAR, summary VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR, content VARCHAR, file_path VARCHAR, metadata JSON);`,
    );
    await connection.run(
      `CREATE TABLE knowledge_relationship (source_id VARCHAR, target_id VARCHAR, field VARCHAR, cardinality VARCHAR);`,
    );
    await connection.run(
      `INSERT INTO knowledge_entity VALUES ('program:lab', 'program', 'lab', 'Laboratory', 'A program', 'active', '2026-01-01', '2026-01-01', 'Program body', 'hidden.mdx', '{"tags":["science"]}'), ('question:test', 'question', 'test', 'Test question', 'A project', 'active', '2026-01-02', '2026-01-02', 'Project body', 'hidden.mdx', '{"programSlug":"lab","tags":[]}');`,
    );
    await connection.run(
      `INSERT INTO knowledge_relationship VALUES ('question:test', 'program:lab', 'programSlug', 'one');`,
    );
    connection.closeSync();
    instance.closeSync();
    const checksum = createHash("sha256")
      .update(await readFile(databasePath))
      .digest("hex");
    await writeFile(
      manifestPath,
      JSON.stringify({
        platformVersion: "1.0.0",
        kernelVersion: "1.0.0",
        buildVersion: "1.0.0",
        schemaVersion: "1.0.0",
        generatedAt: "2026-01-03T00:00:00.000Z",
        contentHash: "fixture",
        generationDuration: 2,
        knowledge: { entities: 2, relationships: 1 },
        artifacts: { knowledgeDatabase: { file: databasePath, checksum } },
      }),
    );
    const adapter = await ArtifactKnowledgeSourceAdapter.create({
      manifestPath,
      rootDirectory: root,
    });
    expect(adapter.loadAll()).toHaveLength(2);
    expect(
      adapter
        .getGraph()
        .getParents("question:test")
        .map((item) => item.id),
    ).toEqual(["program:lab"]);
    expect(
      adapter
        .getGraph()
        .getChildren("program:lab")
        .map((item) => item.id),
    ).toEqual(["question:test"]);
    expect(adapter.getMetadata().knowledge).toEqual({ entities: 2, relationships: 1 });
  });

  it("rejects an artifact whose checksum differs from the manifest", async () => {
    const root = await mkdtemp(join(tmpdir(), "stories-runtime-"));
    temporaryDirectories.push(root);
    const databasePath = join(root, "knowledge.duckdb");
    const manifestPath = join(root, "manifest.json");
    await writeFile(databasePath, "not a database");
    await writeFile(
      manifestPath,
      JSON.stringify({
        platformVersion: "1",
        kernelVersion: "1",
        buildVersion: "1",
        schemaVersion: "1",
        generatedAt: "2026-01-01T00:00:00Z",
        contentHash: "x",
        generationDuration: 1,
        knowledge: { entities: 0, relationships: 0 },
        artifacts: { knowledgeDatabase: { file: databasePath, checksum: "wrong" } },
      }),
    );
    await expect(
      ArtifactKnowledgeSourceAdapter.create({ manifestPath, rootDirectory: root }),
    ).rejects.toThrow("checksum");
  });
});
