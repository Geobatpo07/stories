import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactKnowledgeSourceAdapter } from "../../runtime/adapters/artifact-knowledge-source-adapter";

// Throwaway spike test. Run `python spike.py` first; skipped when out/ is absent so it
// cannot break the normal `pnpm test` run.
const OUT = join(__dirname, "out");
const ready = existsSync(join(OUT, "manifest.json"));

describe.skipIf(!ready)(
  "LadybugDB-exported artifact vs real ArtifactKnowledgeSourceAdapter",
  () => {
    it("is accepted unmodified and its graph matches the Cypher results", async () => {
      const adapter = await ArtifactKnowledgeSourceAdapter.create({
        manifestPath: join(OUT, "manifest.json"),
        rootDirectory: OUT,
      });
      const cypher = JSON.parse(readFileSync(join(OUT, "cypher_graph.json"), "utf8")) as Record<
        string,
        { parents: string[]; children: string[]; related: string[] }
      >;

      const entities = adapter.loadAll();
      expect(entities).toHaveLength(8);
      expect(adapter.getMetadata().knowledge).toEqual({ entities: 8, relationships: 10 });

      const graph = adapter.getGraph();
      const ids = (list: readonly { id: string }[]) => list.map((e) => e.id).sort();
      for (const entity of entities) {
        const expected = cypher[entity.id];
        if (!expected) throw new Error(`no Cypher result for ${entity.id}`);
        expect(ids(graph.getParents(entity.id)), `parents ${entity.id}`).toEqual(expected.parents);
        expect(ids(graph.getChildren(entity.id)), `children ${entity.id}`).toEqual(
          expected.children,
        );
        expect(ids(graph.getRelated(entity.id)), `related ${entity.id}`).toEqual(expected.related);
      }

      const q1 = entities.find((e) => e.id === "question:q1");
      expect(q1).toMatchObject({
        kind: "question",
        programSlug: "lab",
        title: "Why does X happen?",
      });
      expect(q1?.relationships).toEqual([
        {
          field: "programSlug",
          cardinality: "one",
          target: expect.objectContaining({ id: "program:lab" }),
        },
      ]);
      // Non-ASCII content survives LadybugDB -> DuckDB -> Node.
      expect(entities.find((e) => e.id === "program:lab")?.content).toContain("“quotes”");
    });
  },
);
