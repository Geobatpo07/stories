/**
 * Manual end-to-end Definition-of-Done check for the Knowledge Kernel.
 * An empty collection is valid because the repository ships without demonstration
 * research records.
 *
 * Run with: pnpm kernel:verify
 */
import { getKnowledgeGraph, loadEverything, loadResearchNotes, loadTutorials } from "@/kernel";
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
  for (const kind of COLLECTIONS) {
    const count = entities.filter((entity) => entity.kind === kind).length;
    console.warn(`  ${kind}: ${count}`);
  }

  const totalEdges = entities.reduce((sum, entity) => sum + entity.relationships.length, 0);
  console.warn(`Total nodes: ${graph.nodes.size} (entities: ${entities.length})`);
  console.warn(`Total edges: ${totalEdges}`);
  console.warn(
    `Filtered views — research notes: ${loadResearchNotes().length}, tutorials: ${loadTutorials().length}`,
  );

  if (graph.nodes.size !== entities.length) {
    console.error("Kernel verification FAILED.");
    process.exitCode = 1;
    return;
  }

  console.warn("Kernel verification passed.");
}

main();
