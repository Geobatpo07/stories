/**
 * scripts/verify-kernel.ts
 *
 * Manual end-to-end Definition-of-Done check for the Knowledge Kernel.
 * Runs the full lifecycle against the real `content/` tree and reports a
 * per-collection entity count, total node/edge counts, and one concrete
 * spot-check (the example Question resolving to the example Program).
 * Exits non-zero if any collection is empty or any lifecycle stage throws.
 *
 * Run with: pnpm kernel:verify
 */
import {
  findBySlug,
  getKnowledgeGraph,
  loadEverything,
  loadResearchNotes,
  loadTutorials,
} from "@/kernel";
import type { EntityKind } from "@/kernel";

const COLLECTIONS: readonly EntityKind[] = [
  "program",
  "question",
  "hypothesis",
  "experiment",
  "note",
  "software",
  "publication",
  "dataset",
  "presentation",
];

function main(): void {
  const entities = loadEverything();
  const graph = getKnowledgeGraph();

  console.warn("Per-collection counts:");
  let hasEmptyCollection = false;
  for (const kind of COLLECTIONS) {
    const count = entities.filter((entity) => entity.kind === kind).length;
    console.warn(`  ${kind}: ${count}`);
    if (count < 1) hasEmptyCollection = true;
  }

  const totalEdges = entities.reduce((sum, entity) => sum + entity.relationships.length, 0);
  console.warn(`Total nodes: ${graph.nodes.size} (entities: ${entities.length})`);
  console.warn(`Total edges: ${totalEdges}`);

  const researchNoteCount = loadResearchNotes().length;
  const tutorialCount = loadTutorials().length;
  console.warn(
    `Filtered views — research notes: ${researchNoteCount}, tutorials: ${tutorialCount}`,
  );

  const exampleQuestion = findBySlug("question", "cyclone-radial-profile-stability");
  const resolvedProgramTitle = exampleQuestion?.relationships.find(
    (rel) => rel.field === "programSlug",
  )?.target.title;
  console.warn(
    `Spot-check — example Question resolves to Program: ${resolvedProgramTitle ?? "MISSING"}`,
  );

  if (hasEmptyCollection || graph.nodes.size !== entities.length || !resolvedProgramTitle) {
    console.error("Kernel verification FAILED.");
    process.exitCode = 1;
    return;
  }

  console.warn("Kernel verification passed.");
}

main();
