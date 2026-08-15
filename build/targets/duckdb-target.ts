import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { KnowledgeEntity } from "@/kernel";
import { connectForBuild } from "../duckdb/connect";
import type { BuildTargetOutcome } from "../types";
import type { BuildTarget, BuildTargetContext } from "./types";

/** Path recorded in manifest.json — relative, matching how ArtifactKnowledgeSourceAdapter resolves it against its own rootDirectory. */
const MANIFEST_RELATIVE_PATH = "database/generated/knowledge.duckdb";

/**
 * DROPs and recreates `knowledge_entity`/`knowledge_relationship` from the
 * Kernel's already-validated, already-relationship-resolved Knowledge Graph
 * on every run — no incremental writes (ADR-001: "delete and rebuild is
 * always exact"). Schema and column order are fixed by
 * `runtime/adapters/artifact-knowledge-source-adapter.ts`, the sole reader.
 */
export const duckDBBuildTarget: BuildTarget = {
  name: "duckdb",

  async run(context: BuildTargetContext): Promise<BuildTargetOutcome> {
    const startedAt = Date.now();
    const databasePath = join(context.outputDirectory, "knowledge.duckdb");
    await mkdir(dirname(databasePath), { recursive: true });

    const { instance, connection } = await connectForBuild(databasePath);
    try {
      await connection.run("DROP TABLE IF EXISTS knowledge_relationship;");
      await connection.run("DROP TABLE IF EXISTS knowledge_entity;");
      await connection.run(
        "CREATE TABLE knowledge_entity (id VARCHAR, kind VARCHAR, slug VARCHAR, title VARCHAR, summary VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR, content VARCHAR, file_path VARCHAR, metadata JSON);",
      );
      await connection.run(
        "CREATE TABLE knowledge_relationship (source_id VARCHAR, target_id VARCHAR, field VARCHAR, cardinality VARCHAR);",
      );

      const entityRows = context.entities.map(entityValues);
      if (entityRows.length > 0) {
        await connection.run(`INSERT INTO knowledge_entity VALUES ${entityRows.join(", ")};`);
      }

      const relationshipRows = context.entities.flatMap(relationshipValues);
      if (relationshipRows.length > 0) {
        await connection.run(
          `INSERT INTO knowledge_relationship VALUES ${relationshipRows.join(", ")};`,
        );
      }
    } finally {
      connection.closeSync();
      instance.closeSync();
    }

    const checksum = createHash("sha256")
      .update(await readFile(databasePath))
      .digest("hex");
    context.artifacts.set("knowledgeDatabase", { file: MANIFEST_RELATIVE_PATH, checksum });

    return {
      name: "duckdb",
      success: true,
      message: `Wrote ${context.entities.length} entities to ${MANIFEST_RELATIVE_PATH}.`,
      durationMs: Date.now() - startedAt,
      artifactKey: "knowledgeDatabase",
    };
  },
};

function entityValues(entity: KnowledgeEntity): string {
  return `(${[
    sqlString(entity.id),
    sqlString(entity.kind),
    sqlString(entity.slug),
    sqlString(entity.title),
    sqlString(entity.summary),
    sqlString(entity.status),
    sqlString(entity.createdAt),
    sqlString(entity.updatedAt),
    sqlString(entity.content),
    sqlString(entity.filePath),
    sqlString(JSON.stringify(entity.metadata)),
  ].join(", ")})`;
}

function relationshipValues(entity: KnowledgeEntity): readonly string[] {
  return entity.relationships.map(
    (relationship) =>
      `(${[
        sqlString(entity.id),
        sqlString(relationship.target.id),
        sqlString(relationship.field),
        sqlString(relationship.cardinality),
      ].join(", ")})`,
  );
}

/** DuckDB SQL string-literal escaping: double every embedded single quote. */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
