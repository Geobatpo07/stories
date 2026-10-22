# Phase 3 findings: LadybugDB build pipeline, DuckDB export, search index

Branch `migration/phase3-build-pipeline`, built in a fresh clone (`stories-p3`) of `origin/main`. Nothing pushed, no PR. Raw outputs are inline below; full logs are in `backend/evidence/phase-3/`.

## 0. Base state (checked before building anything)

```
$ git ls-remote https://github.com/Geobatpo07/stories.git
29695127f732570ff16f1260b55a20a1eb4fbe97	HEAD
29695127f732570ff16f1260b55a20a1eb4fbe97	refs/heads/main
60d30a2ac109e3a7a707a616ba4ce831d311ec0e	refs/heads/migration/phase-2.5-reconciliation
af1834ee57bd8082e1628c1541096a83fdd17e5b	refs/pull/1/head

$ git log --oneline -8   (fresh clone of origin/main + merge of origin/migration/phase-2.5-reconciliation)
cb175d2 Merge remote-tracking branch 'origin/migration/phase-2.5-reconciliation' into migration/phase3-build-pipeline
2969512 Merge pull request #1 from Geobatpo07/fix/kind-specific-metadata-loss
60d30a2 Add Python backend: Pydantic schema contract and Kernel load pipeline (ADR-004 phases 1-2)
bc93d53 Add LadybugDB Phase 0 spike (isolated, throwaway)
fbae102 Add ADR-003 and ADR-004 for the Python backend migration
af1834e Fix kind-specific frontmatter fields being dropped from the generated artifact
48c2145 Add migration to enable RLS on persistence_records, zero policies
3f7b874 Make the footer Studio link actually discoverable

$ grep -n "metadata:" kernel/pipeline/factory.ts   (the fix from af1834e is in the base)
38:    metadata: Object.freeze({ tags: frontmatter.tags, ...extra }),

$ git ls-tree -r --name-only origin/main -- backend | wc -l   (backend/ is not on main)
0
$ git diff origin/migration/phase-2.5-reconciliation --stat -- backend fixtures spikes docs   (before my Phase 3 edits: the merged backend is byte-identical to the pushed branch)
warning: in the working copy of 'backend/kernel/pipeline/factory.py', LF will be replaced by CRLF the next time Git touches it
 backend/kernel/pipeline/factory.py                 |  4 +-
 .../scenarios/ok-full/expected.json                | 55 +++++++++++++++++-----
 .../scenarios/ok-yaml-quirks/expected.json         |  6 ++-
 3 files changed, 50 insertions(+), 15 deletions(-)

$ git -C ../stories rev-parse HEAD   (the earlier local checkout used for phases 1-2.5)
60d30a2ac109e3a7a707a616ba4ce831d311ec0e
60d30a2ac109e3a7a707a616ba4ce831d311ec0e
```

- The kind-specific-metadata fix **is** on `origin/main` (merge `2969512`, factory line 38 above), so I proceeded.
- `backend/` is **not** on `origin/main` (0 files). It lives on `origin/migration/phase-2.5-reconciliation` (`60d30a2`), which I merged in (`cb175d2`, no conflicts, disjoint paths). The merged `backend/`, `fixtures/`, `spikes/` and `docs/` were byte-identical to that branch before my edits, and that branch tip equals the local checkout `../stories` used for earlier phases. The only diffs against it are my Phase 3 edits (shown by the last diff: `factory.py` plus the two regenerated goldens, then everything below).
- Not re-verified: I did not diff `backend/` against the earlier phases' _reports_, only against the pushed branch, as asked.

## Step 0: re-sync the entity factory

TypeScript `kernel/pipeline/factory.ts` now has `metadata: Object.freeze({ tags: frontmatter.tags, ...extra })`. `backend/kernel/pipeline/factory.py` had the old `{"tags": ...}`. The fix is one line: `metadata={"tags": frontmatter["tags"], **extra}`.

How the divergence showed up (before editing Python): I regenerated the Kernel goldens from the fixed TypeScript Kernel (`UPDATE_GOLDEN=1`), which changed exactly the two scenarios that have kind-specific fields, and pytest then failed on exactly those two:

```
 .../scenarios/ok-full/expected.json         | 55 +++++++++++++++++-----
 .../scenarios/ok-yaml-quirks/expected.json  |  6 ++-
$ pytest tests/test_kernel_contract.py   (Python factory still pre-fix)
FAILED tests/test_kernel_contract.py::test_scenario_matches_typescript_kernel[ok-full]
FAILED tests/test_kernel_contract.py::test_scenario_matches_typescript_kernel[ok-yaml-quirks]
2 failed, 341 passed in 1.17s
```

After the one-line change: `765 passed`. Negative control (re-introducing the old line) is in the controls section: four pytest tests and the parity script fail.

## What was built (`backend/pipeline/`)

| File                             | Role                                                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `graph_store.py`                 | LadybugDB working graph (in-memory by default): load, Cypher `getParents/getChildren/getRelated`, ordered export reads. |
| `duckdb_export.py`               | Writes `knowledge.duckdb`: DDL copied verbatim from `build/targets/duckdb-target.ts`, two tables, no PK, no NOT NULL.   |
| `manifest.py`, `content_hash.py` | Ports of `manifest-target.ts` (same fields, same order, same JSON layout) and `contentHash()`.                          |
| `search_index.py`                | `SearchIndexBuildTarget`: graph-derived relevance tables.                                                               |
| `build.py`, `cli.py`             | `run_build_pipeline()` (never raises for content problems, like the TypeScript one) and `python -m pipeline.cli`.       |
| `errors.py`, `entities_io.py`    | `DuplicateEntityError`; entity JSON interchange for the TypeScript round-trip test.                                     |

Pins in `backend/pyproject.toml`: `ladybug==0.21.2` (the Phase 0 spike's version, unchanged, so no reason to re-run the spike) and `duckdb==1.5.2`. `uv.lock` updated.

## Step 1: LadybugDB working graph

Order of operations: `load_all()` (Kernel port, closed-world relationship resolution, friendly dangling-slug error) runs **before** anything touches LadybugDB. `GraphStore.load()` then inserts nodes and edges with `UNWIND` (one statement each). An edge whose target is not a loaded node raises `KnowledgeRelationshipError` explicitly, because `MATCH ... CREATE` against a missing node silently creates nothing; a final count check guards against any other silent loss.

LadybugDB behavior I verified rather than assumed (probe run, then locked by tests):

- `lb.Database(":memory:")` works; `UNWIND $rows AS r CREATE ...` with a list-of-dict parameter works.
- String `ORDER BY` is byte order for ASCII (`'-' < '1' < ':' < 'B' < 'a'`). The pipeline still re-sorts with an explicit UTF-8 byte key, so it does not depend on that for non-ASCII ids.
- A fixed multi-hop pattern does **not** enforce relationship uniqueness (the same edge can be matched twice). The search query's `a <> b` guard makes that irrelevant there, and a pure-Python reference implementation cross-checks the Cypher (below).

`getParents/getChildren/getRelated` as Cypher equal an independent Python mirror of `createGraph()` for every entity of the full fixture, as sets; ordering is byte order of the id, not the TypeScript insertion order (documented in the module).

## Step 2: duplicate-id check (new behavior)

Same pass as the load: ids are tracked as entities are read, and a collision raises before the second entity is inserted. Real output (`ok-duplicate-slug`, two files with the same kind and slug), through the real CLI:

```
$ cat the two colliding files
--- content/datasets/a-first.mdx
---
title: First
slug: same
description: Description of same
date: "2026-03-01"
---
first
--- content/datasets/b-second.mdx
---
title: Second
slug: same
description: Description of same
date: "2026-03-01"
---
second
$ python -m pipeline.cli --root <that content>   (stdout = report JSON, stderr = reasons)
exit code: 1
--- stderr
[duplicate-id] Duplicate entity "dataset:same": defined in both "content/datasets/a-first.mdx" and "content/datasets/b-second.mdx". Each kind + slug must be unique: change the `slug` in one of the two files (or delete the one you no longer want).
--- stdout: success and validationIssues
{
  "success": false,
  "validationIssues": [
    {
      "check": "duplicate-id",
      "message": "Duplicate entity \"dataset:same\": defined in both \"content/datasets/a-first.mdx\" and \"content/datasets/b-second.mdx\". Each kind + slug must be unique: change the `slug` in one of the two files (or delete the one you no longer want)."
    }
  ],
  "targetResults": []
}
$ ls <root>/database   (nothing written)
ls: cannot access '/tmp/dup/database': No such file or directory
```

The message names both files, the id, and how to fix it, in the style of `KnowledgeValidationError` / `KnowledgeRelationshipError`. The build exits non-zero, writes **no** artifact, and a failed rebuild leaves a previous artifact untouched (`test_a_failed_rebuild_leaves_the_previous_artifact_untouched`). The Node reader also refuses the missing manifest (`python-artifact.test.ts`, last test).

Ordering caveat: the Kernel's relationship pass runs first, so if a build has both a dangling reference and a duplicate, the dangling-reference error is the one reported.

## Step 3: export to the unchanged artifact, and the parity diff

Contract tests parse the TypeScript and fail on drift: the two CREATE TABLE strings and the two DROP statements are compared to `duckdb-target.ts`, the version constants to `build/version.ts`, the manifest key list and order to `manifest-target.ts`. The artifact has exactly two tables and zero constraints, every column nullable (`test_artifact_has_exactly_two_tables_and_no_constraints`). `ORDER BY created_at DESC, id ASC` and `ORDER BY source_id, target_id, field` are checked against DuckDB's own `ORDER BY` over shuffled rows (`test_export_reads_use_the_adapters_ordering`).

`contentHash()`: sorted by **UTF-8 byte order**, a collation I pinned deliberately (documented in `content_hash.py`). Proof it equals Node's `localeCompare` where it matters: ids are `kind:slug` over `[a-z0-9:-]`, and a fixture produced by Node's real `localeCompare` over 261 ids built to stress digit, hyphen and prefix ordering equals byte order (`fixtures/build-contract/id-collation.json`, asserted by Vitest and pytest). Python reproduces the real TypeScript hash for every buildable scenario (`content-hashes.json`, produced by the real `manifestBuildTarget`), e.g. `ok-full` is `cb21f8d0...ffc7c` on both sides.

### Real diff, TypeScript-built vs Python-built artifact, same fixture content

Both artifacts are read with the real Node reader (`@duckdb/node-api`) through `backend/tools/dump-artifact.mjs`, which prints the schema, constraints, table list, both tables in the adapter's read order, and the manifest with `generatedAt`, `generationDuration` and the file checksum blanked. The `file_path` column is excluded from the comparison, as instructed. Full evidence file (`parity-evidence.txt`), verbatim:

```
$ backend/tools/artifact-parity.sh   (all buildable ok-* scenarios)
PARITY OK   ok-full  (68 lines, sha256 f6e5c6a1e94bf9b3)
PARITY OK   ok-empty  (42 lines, sha256 6d9990213088c963)
PARITY OK   ok-yaml-quirks  (45 lines, sha256 db6f511509ac60ac)
PARITY OK   ok-frontmatter-edges  (49 lines, sha256 3e70fee1f5064b99)

### scenario ok-full, TypeScript-built (tsx build/cli.ts) vs Python-built (python -m pipeline.cli --no-search-index)
$ sha256sum ts.dump py.dump   (schema + constraints + table list + both tables in adapter order, file_path excluded + manifest with run-dependent fields blanked)
f6e5c6a1e94bf9b3f6a18b98c64a8715904bd6b09fad50565bac10a866896bb0 *ts.dump
f6e5c6a1e94bf9b3f6a18b98c64a8715904bd6b09fad50565bac10a866896bb0 *py.dump
$ diff ts.dump py.dump
(no output: IDENTICAL)

### the dump being compared (Python side), first 24 lines, then the manifest section
== schema
{"table_name":"knowledge_entity","column_name":"id","ordinal_position":1,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"kind","ordinal_position":2,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"slug","ordinal_position":3,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"title","ordinal_position":4,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"summary","ordinal_position":5,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"status","ordinal_position":6,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"created_at","ordinal_position":7,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"updated_at","ordinal_position":8,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"content","ordinal_position":9,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"file_path","ordinal_position":10,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_entity","column_name":"metadata","ordinal_position":11,"data_type":"JSON","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_relationship","column_name":"source_id","ordinal_position":1,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_relationship","column_name":"target_id","ordinal_position":2,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_relationship","column_name":"field","ordinal_position":3,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
{"table_name":"knowledge_relationship","column_name":"cardinality","ordinal_position":4,"data_type":"VARCHAR","is_nullable":"YES","column_default":null}
== constraints
== table list
knowledge_entity
knowledge_relationship
== knowledge_entity (adapter order)
{"id":"dataset:d-one","kind":"dataset","slug":"d-one","title":"Title of d-one","summary":"Description of d-one","status":"draft","created_at":"2026-03-01","updated_at":"2026-03-01","content":"D.","metadata":"{\"tags\":[],\"sourceU
{"id":"dataset:d-two","kind":"dataset","slug":"d-two","title":"Title of d-two","summary":"Description of d-two","status":"draft","created_at":"2026-03-01","updated_at":"2026-03-01","content":"Different filename.","metadata":"{\"ta
{"id":"experiment:e-one","kind":"experiment","slug":"e-one","title":"Title of e-one","summary":"Description of e-one","status":"draft","created_at":"2026-03-01","updated_at":"2026-03-01","content":"E one.","metadata":"{\"tags\":[]
== manifest (run-dependent fields blanked)
{
  "platformVersion": "3.0.0",
  "kernelVersion": "1.0.0",
  "buildVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "generatedAt": "<blank>",
  "contentHash": "cb21f8d013ef67eff8d572c109d1961705d3e6b435ebbe14b84f4530af9ffc7c",
  "generationDuration": "<blank>",
  "knowledge": {
    "entities": 15,
    "relationships": 11
  },
  "artifacts": {
    "knowledgeDatabase": {
      "file": "database/generated/knowledge.duckdb",
      "checksum": "<blank>"
    }
  }
}

### file_path column INCLUDED: differs on this Windows host (TypeScript stores backslashes), hence excluded above
differing lines: 30
"id":"dataset:d-one"	"file_path":"content\\datasets\\d-one.mdx"
"id":"dataset:d-two"	"file_path":"content\\datasets\\file-name-differs.mdx"
"id":"experiment:e-one"	"file_path":"content\\experiments\\e-one.mdx"
"id":"experiment:e-two"	"file_path":"content\\experiments\\e-two.mdx"

### physical row order differs (Python inserts in the adapter order, TypeScript in Kernel order); adapter-ordered reads are identical
differing lines in physical-order dump: 30

### raw .duckdb file bytes are NOT identical
51b71726484c7a07ce8ef987be3e6e31ad1900ba40c5d7291801a12158c8fe0b *ts/database/generated/knowledge.duckdb
10acb615f9ce6350d77ee152208a0756e57d1c90fc85b1c2c03b2fcfaaeed53c *py/database/generated/knowledge.duckdb
798720 py/database/generated/knowledge.duckdb
798720 ts/database/generated/knowledge.duckdb
bytes that differ (cmp -l | wc -l): 2420
first 16 bytes TS:
00000000: 06d7 6f27 c2da b3b9 4455 434b 4000 0000  ..o'....DUCK@...
first 16 bytes PY:
00000000: 52f6 0daa d087 a1ad 4455 434b 4000 0000  R.......DUCK@...

### contentHash, TS manifest vs Python manifest
  "contentHash": "cb21f8d013ef67eff8d572c109d1961705d3e6b435ebbe14b84f4530af9ffc7c",
  "contentHash": "cb21f8d013ef67eff8d572c109d1961705d3e6b435ebbe14b84f4530af9ffc7c",

### manifests side by side (raw)
--- TS
{
  "platformVersion": "3.0.0",
  "kernelVersion": "1.0.0",
  "buildVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-10-22T16:42:29.261Z",
  "contentHash": "cb21f8d013ef67eff8d572c109d1961705d3e6b435ebbe14b84f4530af9ffc7c",
  "generationDuration": 166,
  "knowledge": {
    "entities": 15,
    "relationships": 11
  },
  "artifacts": {
    "knowledgeDatabase": {
      "file": "database/generated/knowledge.duckdb",
      "checksum": "51b71726484c7a07ce8ef987be3e6e31ad1900ba40c5d7291801a12158c8fe0b"
    }
  }
}
--- PY
{
  "platformVersion": "3.0.0",
  "kernelVersion": "1.0.0",
  "buildVersion": "1.0.0",
  "schemaVersion": "1.0.0",
  "generatedAt": "2026-10-22T16:42:30.471Z",
  "contentHash": "cb21f8d013ef67eff8d572c109d1961705d3e6b435ebbe14b84f4530af9ffc7c",
  "generationDuration": 283,
  "knowledge": {
    "entities": 15,
    "relationships": 11
  },
  "artifacts": {
    "knowledgeDatabase": {
      "file": "database/generated/knowledge.duckdb",
      "checksum": "10acb615f9ce6350d77ee152208a0756e57d1c90fc85b1c2c03b2fcfaaeed53c"
    }
  }
}
```

What that shows, and what it does **not**:

- **Identical:** schema, constraints, table list, all rows of both tables in adapter order, and the manifest (including `contentHash`) for all four buildable scenarios (`ok-full`, `ok-empty`, `ok-yaml-quirks`, `ok-frontmatter-edges`). The dumps have the same sha256.
- **Not identical, as predicted:** `file_path` (this Windows host's TypeScript build stores backslashes; Python always stores `content/...` with forward slashes; 30 differing lines, shown above). Physical row order differs (Python inserts in the adapter's order, TypeScript in Kernel order); reads in adapter order are identical.
- **Raw `.duckdb` bytes are NOT identical**, so a literal byte diff of the files is not achievable: same size (798,720 bytes) but 2,420 bytes differ, starting with the file header's per-database identifier. The comparison is therefore at the logical level through the real reader, and the manifest `checksum` necessarily differs between the two files.
- The Python artifact for this comparison was built with `--no-search-index`; with the search tables on, the only change is two extra tables (the table-list section differs by exactly those two names, which I saw on the first run).
- Linux-built TypeScript output was not compared.

## Step 4: `round-trip.test.ts` against the Python producer

Honest statement of what I changed: the file is not byte-unchanged. I added a producer switch: with `STORIES_ARTIFACT_PRODUCER=python` the same two fixture entities go through `python -m pipeline.cli --entities-json`; otherwise the original TypeScript targets run. **Every assertion is untouched** (diff: 13 insertions, 4 deletions, all in the producer branch and one import). Both modes pass:

```
$ pnpm exec vitest run build/targets/round-trip.test.ts --reporter=verbose   (default: TypeScript producer)
 ✓ build/targets/round-trip.test.ts > DuckDB + Manifest targets round-tripped through ArtifactKnowledgeSourceAdapter > reads back the same entities and relationships that were written 140ms
 Test Files  1 passed (1)
      Tests  1 passed (1)

$ STORIES_ARTIFACT_PRODUCER=python pnpm exec vitest run build/targets/round-trip.test.ts --reporter=verbose   (Python producer, same assertions)
 ✓ build/targets/round-trip.test.ts > DuckDB + Manifest targets round-tripped through ArtifactKnowledgeSourceAdapter > reads back the same entities and relationships that were written 902ms
 Test Files  1 passed (1)
      Tests  1 passed (1)

$ git diff --stat build/targets/round-trip.test.ts
 build/targets/round-trip.test.ts | 17 +++++++++++++----
 1 file changed, 13 insertions(+), 4 deletions(-)
```

## Step 5: DuckDB storage-format skew

Re-confirmed pins: `duckdb==1.5.2` in `backend/pyproject.toml` and `"@duckdb/node-api": "1.5.5-r.1"` in `package.json`, recorded together in `backend/duckdb-compat.json`. `test_duckdb_pin.py` fails if either pin moves alone (negative control 3), if the installed Python version differs from the pin, and has a real Python-writes-Node-reads test. Skew reproduced and caught:

```
### duckdb 2.0.0 (written) vs the pinned Node reader: the skew the pin and CI job exist to catch
written by python duckdb 2.0.0
$ node backend/tools/dump-artifact.mjs <that file>
[Error: IO Error: Trying to read a database file with version number 999, but we can only read versions between 64 and 68.

### same call with the pinned pair (duckdb 1.5.2 writes, @duckdb/node-api 1.5.5-r.1 reads): test_duckdb_pin.py::test_node_reader_opens_a_python_written_artifact
tests/test_duckdb_pin.py::test_python_pin_in_pyproject_matches_the_compat_file PASSED [ 25%]
tests/test_duckdb_pin.py::test_node_pin_in_package_json_matches_the_compat_file PASSED [ 50%]
tests/test_duckdb_pin.py::test_installed_python_duckdb_is_the_pinned_version PASSED [ 75%]
tests/test_duckdb_pin.py::test_node_reader_opens_a_python_written_artifact PASSED [100%]
============================== 4 passed in 1.73s ==============================

### the pins
18:    "duckdb==1.5.2",
31:    "@duckdb/node-api": "1.5.5-r.1",
{
  "_comment": "The DuckDB pair validated against each other: knowledge.duckdb is WRITTEN by the Python `duckdb` package and READ by `@duckdb/node-api` (ArtifactKnowledgeSourceAdapter). Change either pin only together with this file, after the `python-artifact` CI job (Python writes, Node reads) passes with the new pair. duckdb 2.0.0 wrote a storage format this reader rejected.",
  "python": "1.5.2",
  "node": "1.5.5-r.1"
}
```

CI: a new `python-artifact` job in `.github/workflows/ci.yml` (Python 3.12, `uv sync --frozen`, full pytest, then `STORIES_ARTIFACT_PRODUCER=python vitest` on the round-trip, the real-content artifact test and the contract fixtures, then the parity script). **I could not run GitHub Actions from here**: I parsed the YAML and ran every command of that job locally on Windows with Python 3.13 and Node 22, but the job itself, ubuntu, Python 3.12 and Node 20.9 are unexecuted.

## Step 6: `SearchIndexBuildTarget`

Schema (two extra tables in the same `knowledge.duckdb`, no keys, ignored by the adapter):

```
knowledge_search_related(entity_id, related_id, score DOUBLE, hops INTEGER, fields VARCHAR)
knowledge_search_stats(entity_id, in_degree INTEGER, out_degree INTEGER)
```

Scoring, from Cypher over the LadybugDB graph (edges traversed undirected): edge weight `one`=1.0, `many`=0.5; 1-hop path = weight; 2-hop path = w1 x w2 x 0.5 (a-m-b, b != a); score = sum of path scores rounded to 6 decimals; top 20 per entity, `score DESC` then byte order of `related_id`. Full-text search was deliberately not used: DuckDB's FTS extension is downloaded at install time, which would add a network dependency to the build; the text half stays in `lib/presentation/search.ts`.

Locked by: Cypher output equals an independent pure-Python implementation of the documented rules (`test_cypher_signals_equal_the_independent_reference`, three scenarios), a hand-checked case, ordering and symmetry, the tables landing next to the two base tables with no constraints, and the real Node reader reading them (`python-artifact.test.ts`: `program:lab` has `in_degree 4, out_degree 2` and a top related score above 1).

Static-artifact principle: a search read is a `SELECT` on a file already on disk; nothing calls a backend.

Limits: the scoring weights are my design, not tuned or evaluated against any relevance judgment, and nothing consumes these tables yet (`lib/presentation/search.ts` is unchanged).

## Performance finding (found while benchmarking, fixed)

My first export used `executemany`; a 100-entity build took ~8.6 s and a 300-entity one ~26 s, growing linearly. Profiling showed ~24,000 `importlib._find_and_load` calls: the DuckDB Python client probes optional modules (numpy, pandas, ...) for every bound value and each probe is a failed import. Batching rows did not help (it made 1,000 entities take 63 s); passing each table as one JSON parameter unpacked by `json_transform` + `unnest` did. After the fix (`benchmark.txt`, synthetic entities, ~2 KB bodies, this laptop):

```
   100 entities    165 edges  total     338 ms  stages(ms) {'ladybug-graph': 94, 'duckdb': 191, 'manifest': 2}  ok=True
  1000 entities   1650 edges  total    1204 ms  stages(ms) {'ladybug-graph': 473, 'duckdb': 671, 'manifest': 6}  ok=True
  5000 entities   8250 edges  total    6522 ms  stages(ms) {'ladybug-graph': 3371, 'duckdb': 3013, 'manifest': 21}  ok=True
```

Before the fix, 5,000 entities took 328 s. This is the number ADR-004 Phase 6 asked for: rebuilding the whole graph and artifact from scratch is ~0.3 s at 100 entities and ~6.5 s at 5,000. The real `content/` is empty today, so this is synthetic only.

## Negative controls (do the guards actually fail?)

```
### NEGATIVE CONTROL 1: Python factory reverted to the pre-fix metadata ({"tags"} only)
FAILED tests/test_artifact_contract.py::test_metadata_column_carries_kind_specific_fields
FAILED tests/test_artifact_contract.py::test_metadata_json_text_matches_javascript_json_stringify
FAILED tests/test_kernel_contract.py::test_scenario_matches_typescript_kernel[ok-full]
FAILED tests/test_kernel_contract.py::test_scenario_matches_typescript_kernel[ok-yaml-quirks]
4 failed, 813 passed in 10.76s
--- parity script:
PARITY FAIL ok-full

### NEGATIVE CONTROL 2: DDL drift (add a PRIMARY KEY to the Python CREATE TABLE)
FAILED tests/test_artifact_contract.py::test_ddl_is_copied_verbatim_from_duckdb_target_ts
FAILED tests/test_artifact_contract.py::test_artifact_has_exactly_two_tables_and_no_constraints
2 failed, 8 passed in 2.34s

### NEGATIVE CONTROL 3: node pin bumped without the compat file
FAILED tests/test_duckdb_pin.py::test_node_pin_in_package_json_matches_the_compat_file
1 failed, 3 passed in 1.31s

### restored: full pytest
817 passed in 9.57s
(package.json diff empty = restored)
```

## Verification (raw)

### pytest

```
tests/test_search_index.py::test_tables_are_written_next_to_the_two_base_tables PASSED [ 99%]
tests/test_search_index.py::test_search_index_can_be_skipped PASSED      [100%]
============================ 817 passed in 10.66s =============================
```

Per-file counts (from the verbose log): test_artifact_contract.py 10, test_content_hash.py 8, test_duckdb_pin.py 4, test_graph_store.py 10, test_kernel_contract.py 343, test_pipeline_build.py 13, test_schema_contract.py 422, test_search_index.py 7 (total 817). Full verbose output: `backend/evidence/phase-3/pytest-verbose.txt`.

### TypeScript, default producer

`pnpm typecheck`:

```

> stories@3.0.0 typecheck C:\Users\gblaguerre\Documents\Data Analytics Projects\stories-p3
> tsc --noEmit
```

`pnpm lint`:

```

> stories@3.0.0 lint C:\Users\gblaguerre\Documents\Data Analytics Projects\stories-p3
> eslint .
```

`pnpm test` (tail):

```
   ✓ Python-built artifact read by the real Node reader > builds an empty laboratory  2109ms
   ✓ Python-built artifact read by the real Node reader > refuses a duplicate id, naming both files, and writes no artifact  1077ms
 Test Files  49 passed | 1 skipped (50)
      Tests  617 passed | 1 skipped (618)
   Start at  18:41:53
   Duration  10.70s (transform 6.40s, setup 0ms, collect 33.06s, tests 18.86s, environment 27ms, prepare 21.01s)
```

`pnpm test` includes the new Python-backed Vitest tests because `backend/.venv` exists on this machine; without Python they skip themselves (`describe.skipIf`), so a Node-only environment still passes.

### TypeScript pointed at the Python-built artifact

`STORIES_ARTIFACT_PRODUCER=python pnpm exec vitest run build/targets/round-trip.test.ts build/targets/python-artifact.test.ts fixtures --reporter=verbose` (filtered to the relevant lines):

```
 ✓ build/targets/round-trip.test.ts > DuckDB + Manifest targets round-tripped through ArtifactKnowledgeSourceAdapter > reads back the same entities and relationships that were written 1200ms
 ✓ build/targets/python-artifact.test.ts > Python-built artifact read by the real Node reader > is accepted by ArtifactKnowledgeSourceAdapter, with kind-specific fields and the graph intact 1339ms
 ✓ build/targets/python-artifact.test.ts > Python-built artifact read by the real Node reader > carries graph-derived search signals in the same static file 1204ms
 ✓ build/targets/python-artifact.test.ts > Python-built artifact read by the real Node reader > builds an empty laboratory 853ms
 ✓ build/targets/python-artifact.test.ts > Python-built artifact read by the real Node reader > refuses a duplicate id, naming both files, and writes no artifact 803ms
 Test Files  5 passed (5)
      Tests  450 passed (450)
```

## Not done, or not verified

- **CI not executed** (see Step 5). Python 3.12 (the declared floor) was never run; everything ran on 3.13.
- **Not wired into the real build.** `pnpm build:knowledge`, `vercel.json` and `authoring/workflow.ts` still use the TypeScript pipeline. I did not delete `build/duckdb/connect.ts` or the TypeScript targets (ADR-003/004 say to delete after parity; deleting them while Python is not in the Vercel build would break deployment). No Vercel, Services or MCP work.
- **Real `content/` is empty**, so "real content" checks use the fixture scenarios; no real-volume benchmark.
- Raw `.duckdb` byte equality is not achievable (shown above); parity is logical, through the real reader.
- `localeCompare` equivalence was observed on one Node/ICU build and Windows only; the fixture test will catch a difference elsewhere, nothing else will.
- LadybugDB was only used in memory. On-disk persistence, reopen, concurrency and a LadybugDB upgrade were not tested.
- Search weights untuned; FTS not implemented; `lib/presentation/search.ts` untouched.
- The `kernel-contract` goldens for `ok-full` and `ok-yaml-quirks` were regenerated from the fixed TypeScript Kernel (they now contain the kind-specific fields in `metadata`).
- ADR-004 was not revised.
