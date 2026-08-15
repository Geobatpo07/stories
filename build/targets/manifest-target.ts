import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { KnowledgeEntity } from "@/kernel";
import type { BuildTargetOutcome } from "../types";
import { BUILD_VERSION, KERNEL_VERSION, PLATFORM_VERSION, SCHEMA_VERSION } from "../version";
import type { BuildTarget, BuildTargetContext } from "./types";

/**
 * Writes `manifest.json`, satisfying `KnowledgeSourceMetadata`
 * (`runtime/ports/types.ts`) plus the `artifacts` map
 * `ArtifactKnowledgeSourceAdapter.create()` reads. Must run after the DuckDB
 * target — it reads that target's published checksum from the shared
 * context rather than recomputing it.
 */
export const manifestBuildTarget: BuildTarget = {
  name: "manifest",

  async run(context: BuildTargetContext): Promise<BuildTargetOutcome> {
    const startedAt = Date.now();
    const database = context.artifacts.get("knowledgeDatabase");
    if (!database) {
      return {
        name: "manifest",
        success: false,
        message: "No knowledgeDatabase artifact was published by an earlier target.",
        durationMs: Date.now() - startedAt,
      };
    }

    const relationshipCount = context.entities.reduce(
      (sum, entity) => sum + entity.relationships.length,
      0,
    );
    const manifest = {
      platformVersion: PLATFORM_VERSION,
      kernelVersion: KERNEL_VERSION,
      buildVersion: BUILD_VERSION,
      schemaVersion: SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      contentHash: contentHash(context.entities),
      generationDuration: Date.now() - context.startedAt,
      knowledge: { entities: context.entities.length, relationships: relationshipCount },
      artifacts: { knowledgeDatabase: database },
    };

    const manifestPath = join(context.outputDirectory, "manifest.json");
    await mkdir(context.outputDirectory, { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    return {
      name: "manifest",
      success: true,
      message: `Wrote manifest.json (${manifest.knowledge.entities} entities, ${manifest.knowledge.relationships} relationships).`,
      durationMs: Date.now() - startedAt,
      artifactKey: "manifest",
    };
  },
};

/** Deterministic, order-independent fingerprint of source content — changes iff any entity's identity, update time, or body changes. */
function contentHash(entities: readonly KnowledgeEntity[]): string {
  const material = [...entities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entity) => `${entity.id}|${entity.updatedAt}|${entity.content}`)
    .join("\n");
  return createHash("sha256").update(material).digest("hex");
}
