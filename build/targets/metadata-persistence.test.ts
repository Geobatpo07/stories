import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KnowledgeEntity } from "@/kernel";
// Deliberately reaches past the Kernel barrel into its internals: the whole point of this test
// is to run the REAL createEntity() / resolveRelationships() / buildKnowledgeGraph() instead of a
// hand-built KnowledgeEntity literal (see "Why this test exists" below).
import { createEntity } from "@/kernel/pipeline/factory";
import { buildKnowledgeGraph } from "@/kernel/pipeline/graph";
import { resolveRelationships } from "@/kernel/pipeline/relationships";
import { registrations } from "@/kernel/registry/registrations";
import { ArtifactKnowledgeSourceAdapter } from "@/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { duckDBBuildTarget } from "./duckdb-target";
import { manifestBuildTarget } from "./manifest-target";
import type { BuildTargetContext } from "./types";

/**
 * Why this test exists: `round-trip.test.ts` hand-builds its KnowledgeEntity fixtures with
 * `theme` / `programSlug` already inside `metadata`. The real Kernel factory used to put those
 * kind-specific fields only on the entity's top level, and the DuckDB target only serializes
 * `entity.metadata`, so every build silently dropped them and the live site fell back to
 * "Open inquiry" / "Not specified". A hand-built fixture could never have caught that. This
 * test chains the real factory -> DuckDB target -> manifest -> ArtifactKnowledgeSourceAdapter.
 */
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function registrationFor(kind: string) {
  const registration = registrations.find((candidate) => candidate.kind === kind);
  if (!registration) throw new Error(`No registration for kind "${kind}"`);
  return registration;
}

function buildEntity(
  kind: string,
  slug: string,
  frontmatter: Record<string, unknown>,
): KnowledgeEntity & Record<string, unknown> {
  return createEntity(
    registrationFor(kind),
    {
      slug,
      data: {},
      content: `Body of ${slug}`,
      sourcePath: `content/${kind}s/${slug}.mdx`,
    },
    {
      title: `Title of ${slug}`,
      slug,
      description: `Summary of ${slug}`,
      date: "2026-03-01",
      status: "active",
      tags: ["beta", "alpha"],
      ...frontmatter,
    },
  );
}

describe("kind-specific frontmatter survives the real build pipeline", () => {
  it("persists program.theme, program.leadResearcher and question.programSlug through DuckDB", async () => {
    const entities = resolveRelationships(
      [
        buildEntity("program", "lab", {
          theme: "Climate",
          leadResearcher: "A. Person",
          relatedQuestionSlugs: ["q-one"],
        }),
        buildEntity("question", "q-one", { programSlug: "lab" }),
      ],
      registrations,
    );

    const rootDirectory = await mkdtemp(join(tmpdir(), "stories-build-metadata-"));
    directories.push(rootDirectory);
    const context: BuildTargetContext = {
      entities,
      graph: buildKnowledgeGraph(entities),
      outputDirectory: join(rootDirectory, "database/generated"),
      artifacts: new Map(),
      startedAt: Date.now(),
    };

    expect((await duckDBBuildTarget.run(context)).success).toBe(true);
    expect((await manifestBuildTarget.run(context)).success).toBe(true);

    const adapter = await ArtifactKnowledgeSourceAdapter.create({
      manifestPath: join(rootDirectory, "database/generated/manifest.json"),
      rootDirectory,
    });
    const rehydrated = adapter.loadAll();

    const program = rehydrated.find((entity) => entity.id === "program:lab") as
      (KnowledgeEntity & Record<string, unknown>) | undefined;
    expect(program?.theme).toBe("Climate");
    expect(program?.leadResearcher).toBe("A. Person");
    expect(program?.relatedQuestionSlugs).toEqual(["q-one"]);
    expect(program?.metadata).toMatchObject({
      tags: ["beta", "alpha"],
      theme: "Climate",
      leadResearcher: "A. Person",
    });

    const question = rehydrated.find((entity) => entity.id === "question:q-one") as
      (KnowledgeEntity & Record<string, unknown>) | undefined;
    expect(question?.programSlug).toBe("lab");
    expect(question?.metadata).toMatchObject({ programSlug: "lab" });
    expect(question?.relationships.map((relationship) => relationship.target.id)).toEqual([
      "program:lab",
    ]);
  });
});
