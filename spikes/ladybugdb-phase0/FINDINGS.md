# LadybugDB Phase 0 spike: findings

Branch `spike/ladybugdb-phase0`. Everything lives in `spikes/ladybugdb-phase0/`. Nothing under `build/`, `kernel/`, `runtime/` or `authoring/` was modified.

Environment: Windows 11, CPython 3.13.9, uv 0.9.10, `ladybug==0.21.2`, `duckdb==1.5.2`. Node 22 with the repo's `@duckdb/node-api 1.5.5-r.1`.

## Reproduce

```
cd spikes/ladybugdb-phase0
uv venv .venv && uv pip install --python .venv/Scripts/python.exe -r requirements.txt
.venv/Scripts/python.exe spike.py          # writes out/{graph.lbug,knowledge.duckdb,manifest.json,...}
cd ../.. && npx vitest run spikes/ladybugdb-phase0
```

- `fixture.py` holds 8 entities across 4 kinds (program x2, question x2, hypothesis x3, note x1) and 10 edges. The fixture has:
  - a bidirectional program<->question pair (`programSlug` and `relatedQuestionSlugs`);
  - a multi-edge note->question;
  - an isolated entity;
  - non-ASCII content.
- `spike.py` runs load, Cypher and export.
- `artifact-contract.spike.test.ts` is the throwaway Vitest test. It skips itself if `out/` is absent, so it can't break `pnpm test`.

## Step-by-step results

| Step                                             | Result                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Load nodes and edges                         | Works. Schema is `NODE TABLE Entity(...)` plus `REL TABLE Rel(FROM Entity TO Entity, field, cardinality)`. Parametrized `CREATE` works for nodes. Edges use `MATCH (a),(b) CREATE (a)-[:Rel]->(b)`. Multi-edges between the same pair are allowed.                                                                                                                                                                |
| (b) Cypher getParents / getChildren / getRelated | Works. Parents are `(n)-[:Rel]->(p)`, children are `(c)-[:Rel]->(n)`, related is the undirected `(n)-[:Rel]-(x)` with `DISTINCT`. For all 8 entities and all three queries the results match a Python mirror of `createGraph()` as sets.                                                                                                                                                                          |
| (c) Export to the DuckDB schema                  | Works. The DDL is copied verbatim from `build/duckdb/schema.ts`, so table and column names, order and types match. `DESCRIBE` output confirms it, including `metadata JSON` and `generated_at TIMESTAMP`.                                                                                                                                                                                                         |
| Real reader                                      | The real `ArtifactKnowledgeSourceAdapter.create()` accepts the artifact unmodified: checksum, row counts and manifest shape all pass. The `getParents`/`getChildren`/`getRelated` results from the hydrated graph equal the Cypher results for every entity. The test also checks hydrated `programSlug`, relationship refs and the non-ASCII content. **1/1 passing**, once `duckdb` was pinned (see surprises). |

Caveat on "matches createGraph()": the comparison is as **sets** (`ORDER BY p.id` in Cypher). The real adapter returns insertion order, which comes from the relationship rows' `ORDER BY source_id, target_id, field`. Cypher has no implicit order. A Phase 3 export must keep the explicit `ORDER BY` on both tables to stay deterministic. Order was not asserted against the TS output here.

## Timings (8 nodes, 10 edges, one warm run on a laptop, indicative only)

| Operation                                                 | ms       |
| --------------------------------------------------------- | -------- |
| Open or create DB                                         | ~33-49   |
| Create schema                                             | ~18      |
| Load 8 nodes (one statement each)                         | ~22-25   |
| Load 10 edges (one statement each)                        | ~26-28   |
| 3 queries x 8 entities (24 queries)                       | ~106-143 |
| One parents query                                         | ~4       |
| Export (2 Cypher reads + DuckDB DDL, inserts, checkpoint) | ~128-209 |

Per-statement latency is a few ms. Row-at-a-time loading is fine here but won't scale. I did not test bulk paths (`COPY FROM` Parquet/CSV, Arrow, or `UNWIND` with a list parameter). Phase 3 should benchmark those against real content volume before assuming per-row is acceptable. This is also relevant to ADR-004's Phase 6 concern about rebuilding the graph on a cold start.

## Surprises, and where the ADRs and task brief were wrong

1. **PyPI naming is confusing.** There are two LadybugDB bindings:
   - `ladybug` (0.21.2) is current and imports as `ladybug`.
   - `real-ladybug` (0.15.3) is an older name and imports as `real_ladybug`.

   I used `ladybug` and pinned it. The ADR doesn't name the package, so Phase 1 should record it.

2. **DuckDB version skew is a real contract risk.** Python `duckdb==2.0.0` (the latest at spike time) wrote a file the repo's Node reader rejected: `Trying to read a database file with version number 999, but we can only read versions between 64 and 68`. Pinning Python `duckdb==1.5.2` fixed it. Any Python producer must pin its DuckDB to a storage format the Node `@duckdb/node-api` can read (here 1.5.x). A Phase 3 contract test must run against the real adapter, and CI should fail on a bump of either side. ADR-003 and ADR-004 treat `duckdb` as a free dependency, and it isn't.
3. **`build/targets/round-trip.test.ts` does not exist.** Both ADRs and the task brief cite it. The closest real tests are `runtime/adapters/artifact-knowledge-source-adapter.test.ts` (hand-built DuckDB fixture) and `build/targets/duckdb-target.test.ts`. Phase 3's "run round-trip.test.ts unchanged" has no such test to run. A producer-agnostic contract test has to be written, and this spike's test is a starting point.
4. **"Two-table schema".** The generated file has four tables (`knowledge_entity`, `knowledge_relationship`, `knowledge_snapshot`, `knowledge_metadata`). The adapter reads only the first two. I exported all four, so the file matches `duckdb-target.ts`. Phase 1 should decide whether the contract is two tables (reader) or four (producer).
5. **`manifest-target.ts` has little logic.** The manifest shape lives in `build/manifest/build-manifest.ts`. `contentHash` comes from `build/hash/content-hash.ts`. This spike used a simplified hash (sorted-key JSON, `relationships` and `file_path` stripped, SHA-256), not byte-compatible with the TS one. The adapter never recomputes it, so it passed. Phase 3 needs byte-parity if anything compares hashes. Also, `environment.node` is Node-specific in the TS manifest, and the Python side has no Node version to report.
6. **Edge metadata.** I stored `metadata` as a JSON string in a `STRING` column, which round-trips cleanly into `?::JSON`. I did not evaluate LadybugDB's own JSON extension or native MAP/STRUCT types.
7. **Not tested:**
   - persistence across reopen (the `graph.lbug` file was written but never reopened);
   - concurrent access;
   - failure and rollback behavior;
   - Python-side relationship validation (assumed done upstream, as in ADR-004);
   - `ladybug` as a long-lived service dependency (wheel size is about 5 MB; install took about 1 s).

## Recommendation: GO for Phase 1

The three questions ADR-004's Phase 0 asked all come out yes: LadybugDB's Python client loads the graph, answers the Cypher equivalents correctly, and exports into the exact DuckDB shape. The real `ArtifactKnowledgeSourceAdapter` reads that export unmodified. Nothing here blocks Phase 1 (schema contract), but carry these into it:

- Pin `ladybug` and `duckdb`, with `duckdb` matched to the Node `@duckdb/node-api` storage version, and add a CI check for skew.
- Write the missing producer-agnostic contract test (finding 3).
- Decide the two-table vs four-table contract (finding 4).
- Benchmark bulk load before Phase 3 (timings section).

---

## Addendum, 2026-10-22: corrections found during the Phase 2.5 reconciliation

This spike read `build/` on a stale local checkout (`e297e27`). On that checkout `build/` was hidden by a bare `build` rule in `.gitignore`, so the files I read (`build/duckdb/schema.ts`, `build/duckdb/populate.ts`, `build/hash/`, `build/manifest/`, `build/pipeline/orchestrator.ts`, ...) were **never committed** and are not what `origin/main` ships. The contract that actually ships is in `build/targets/duckdb-target.ts` and `build/README.md` on `origin/main` (`48c2145`). Consequences for the findings above:

- **Finding 4 ("two tables vs four") is moot.** The real artifact has **two** tables (`knowledge_entity`, `knowledge_relationship`) with no primary keys or NOT NULL constraints, and no `knowledge_snapshot` or `knowledge_metadata`. The spike exported the extra two tables and the constraints from the stale code. The adapter read that superset fine, but the spike did **not** reproduce the real schema exactly, contrary to what it claims.
- **Finding 5 (manifest and hash layout) describes stale code.** The real `contentHash` is in `build/targets/manifest-target.ts`: SHA-256 of `id|updatedAt|content` lines, sorted by `localeCompare`. The adapter does not recompute it.
- Findings about LadybugDB itself (package name, load/query/export behavior, timings) and the DuckDB version skew are unaffected.

See `backend/RECONCILIATION-FINDINGS.md`.
