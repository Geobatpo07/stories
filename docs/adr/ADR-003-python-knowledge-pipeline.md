# ADR-003: Python owns the Knowledge Artifact Pipeline's data targets

- **Status:** Proposed
- **Date:** 2026-10-21
- **Relates to:** ADR-001 (MDX is the source of truth; DuckDB is a generated index), ADR-002
  (Knowledge Objects are the source of truth)

## Context

Stories' business logic is deliberately concentrated in one framework-free module,
`kernel/`, consumed in-process by three independent TypeScript callers:
`domain/*/service.ts` (thin wrappers for `app/`), `runtime/` (the live Platform Runtime
behind the Studio and, in principle, request-time reads), and `build/` (the Knowledge
Artifact Pipeline, which compiles the Kernel's in-memory graph into
`database/generated/knowledge.duckdb` and `manifest.json`).

`build/` is already the most isolated of the three: per `build/README.md`, it depends on
`@/kernel` and `@duckdb/node-api` only, contains no business logic of its own, and exists
precisely because "something has to sit between [the Kernel] and the Runtime, on a
different cadence (build time, not request time)." Its two Build Targets
(`build/targets/duckdb-target.ts`, `build/targets/manifest-target.ts`) write a schema and
a JSON shape that are a pinned, tested contract (`build/targets/round-trip.test.ts`)
consumed by exactly one reader, `runtime/adapters/artifact-knowledge-source-adapter.ts` —
which only ever reads files off disk and has no idea what process wrote them.

`runBuildPipeline()` has two real callers today:

1. `build/cli.ts` (`pnpm build:knowledge`), run locally and as the first step of
   `vercel.json`'s `buildCommand`. This is a pure CI/build-time invocation.
2. `authoring/workflow.ts`'s `AuthoringWorkflow.publish()`, awaited in-process with no
   `try`/`catch`, relying on `result.success` to decide whether to roll back a Studio
   publication. Per `docs/release/V3-RELEASE-NOTES.md`, the Studio "is enabled for local
   development and disabled on public production deployments by default" — so this
   in-process call only ever happens inside a long-lived local `next dev` process, never
   inside a Vercel serverless function. That removes the one constraint (serverless
   functions can't reliably persist local disk writes, per
   `docs/architecture/AUTHORING-STUDIO.md`) that would otherwise block spawning a
   subprocess from it.

Separately: `domain/`, `kernel/`, `runtime/`, `authoring/`, `auth/`, `components/`, and
`app/` are not in scope for this migration. The Kernel's Zod schemas, relationship
resolution, and normalization are consumed live by the Studio's generated React forms;
re-implementing any of that in Python a second time would reintroduce exactly the
two-sources-of-truth risk ADR-001 and ADR-002 were written to eliminate, for a far smaller
payoff than the data-pipeline move below.

## Decision

Move only the two existing Build Targets — the part of `build/` that writes
`knowledge.duckdb` and `manifest.json` — into a new Python package, invoked as a
subprocess from a thinner TypeScript orchestrator. Everything upstream of that (loading
and validating content, resolving relationships, producing the in-memory
`KnowledgeEntity[]`/`KnowledgeGraph`) stays exactly where it is, in `@/kernel`.

The seam is a frozen JSON interchange: a new, small TypeScript step serializes the
Kernel's already-validated, already-resolved `KnowledgeEntity[]` to a JSON file; a new
Python CLI reads that file and does everything `duckdb-target.ts` and
`manifest-target.ts` do today — DROP + CREATE + bulk insert into DuckDB via its native
Python client, compute the SHA-256 checksum, compute the content hash, write
`manifest.json`. Table schema, column order, and manifest shape stay byte-identical, so
`ArtifactKnowledgeSourceAdapter` — and everything above it — needs zero changes.

`runBuildPipeline()`'s public return shape (`BuildPipelineResult`/`BuildReport`) is
likewise frozen, so `authoring/workflow.ts` needs zero changes either.

## Consequences

- A process boundary now exists where there wasn't one: Python cannot call `@/kernel`
  in-process, so every future Build Target that needs Kernel data (not just the two being
  migrated) must go through the same JSON export rather than importing the Kernel
  directly. This is a deliberate, narrow trade: it isolates Python entirely behind the
  artifact contract instead of letting it reach into business logic.
- Local development and CI both gain a Python prerequisite (interpreter + a small
  dependency set, `duckdb` to start). `docs/operations/DEVELOPER-WORKFLOW.md` and
  `README.md` need a new "Requirements" line, and the project should fail loudly and
  early (matching `DEPLOYMENT.md`'s existing fail-closed philosophy) if `python3` or its
  dependencies are missing, rather than failing deep inside a subprocess call.
- `vercel.json`'s `installCommand`/`buildCommand` need a Python dependency install step.
  This does **not** need Vercel's Python Functions/Services feature — that exists for
  live serverless functions, and this pipeline only ever runs at build time (DuckDB "is
  required while building pages but not for ordinary page requests," per
  `DEPLOYMENT.md`). A plain `pip install` (or `uv sync`) prepended to the existing install
  step is enough; Vercel's build image already ships Python 3.
- GitHub Actions needs `actions/setup-python` alongside `actions/setup-node` wherever
  `pnpm release:verify` runs, since that script chains `build:knowledge`.
- This opens the door for the actual motivation behind the switch: the roadmap's
  already-named future Build Targets (`SearchIndexBuildTarget`, `StatisticsBuildTarget`,
  `EmbeddingBuildTarget`, `VectorIndexBuildTarget` — all listed in `build/README.md` and
  `build/targets/registry.ts`) become natural Python modules (pandas/polars, embedding
  libraries) instead of Node ones, without having paid for that by duplicating the
  Kernel's business logic to get there.
- `@duckdb/node-api` and `build/duckdb/connect.ts` are removed once parity is proven,
  shrinking the Node dependency surface.

## Explicitly out of scope

`kernel/`, `domain/*`, `runtime/`, `authoring/`, `auth/`, `components/`, `app/` stay
TypeScript. Revisit only under a future ADR if the project ever considers replacing
Next.js/React itself — not as a side effect of this one.

---

# Migration plan

## Phase 0 — Guardrails before touching anything

- Run `pnpm build:knowledge` once against the real `content/` tree and keep a copy of the
  resulting `database/generated/knowledge.duckdb` and `manifest.json` as a local
  reference (not committed — both are gitignored by design). Every later phase diffs
  against this, table rows and manifest fields (except `generatedAt` /
  `generationDuration`), before anything is allowed to replace the TypeScript targets.
- Pick the Python toolchain now: a `.python-version`-pinned CPython (3.12+, matching what
  Vercel's Python runtime defaults to) and `uv` for dependency management, since Vercel
  already supports zero-config `uv` builds and it mirrors `pnpm`'s lockfile discipline.

## Phase 1 — Define the interchange contract (TypeScript, still inside the Kernel boundary)

- Add one new module, e.g. `build/export/knowledge-graph-export.ts`, with a pure function
  `serializeKnowledgeGraph(entities: readonly KnowledgeEntity[]): KnowledgeGraphExport`
  that shapes exactly the fields `duckdb-target.ts`'s `entityValues()` /
  `relationshipValues()` consume today — nothing more.
- `runBuildPipeline()` calls this right after `loadEverything()` and writes it to, e.g.,
  `database/generated/.intermediate/knowledge-graph.json`. This file is an implementation
  detail of the pipeline, not a new public artifact — it is never read by
  `ArtifactKnowledgeSourceAdapter` or anything outside `build/`.
- This step is still 100% TypeScript, still touches `@/kernel` directly, and gets its own
  co-located test, matching the rest of `build/`'s convention.

## Phase 2 — Python package skeleton

- New top-level directory, e.g. `pipeline/` (sibling to `build/`, outside the TS module
  graph), with its own `pyproject.toml` and `duckdb` as the only runtime dependency to
  start.
- `pipeline/knowledge_db.py`: port `duckdb-target.ts`'s SQL verbatim — same two tables,
  same column names and order, same DROP-then-CREATE-then-bulk-insert, same SHA-256
  checksum computation.
- `pipeline/manifest.py`: port `manifest-target.ts`'s content-hash algorithm and manifest
  shape exactly. The three version constants (`KERNEL_VERSION`, `BUILD_VERSION`,
  `SCHEMA_VERSION`) and `package.json`'s version stay defined once, in TypeScript — pass
  them into the Python CLI as arguments rather than hardcoding a second copy in Python.
- `pipeline/cli.py`: one entrypoint — JSON-export path and output directory in, a single
  JSON result out on stdout shaped like today's two `BuildTargetOutcome`s (`duckdb` and
  `manifest`), non-zero exit on any failure.
- `pytest` unit tests mirroring `duckdb-target.test.ts` and `manifest-target.test.ts`.

## Phase 3 — Rewire the orchestrator without changing its public contract

- `build/pipeline.ts`: after writing the JSON export, spawn `pipeline/cli.py` as a child
  process (`node:child_process execFile`, with a timeout), parse its JSON stdout back
  into the existing `BuildTargetOutcome[]`. `BuildPipelineResult` / `BuildReport` do not
  change shape — `authoring/workflow.ts` needs no edits.
- Decide whether `build/targets/registry.ts` still models "duckdb" and "manifest" as two
  separately orderable entries that both happen to shell out to the same Python process,
  or collapses to one `pythonPipelineTarget`. Lean toward keeping two entries: it
  preserves the existing per-target reporting granularity and keeps the registry pattern
  available for the next (likely Python-side) target without a second refactor.
- Once parity is proven (Phase 4), delete `build/duckdb/connect.ts`,
  `build/targets/duckdb-target.ts`, `build/targets/manifest-target.ts`, and the
  `@duckdb/node-api` dependency from `package.json`.

## Phase 4 — Prove the contract, don't trust it

- Run the old and new pipelines against the same `content/` tree; diff
  `knowledge.duckdb` row-for-row and `manifest.json` field-for-field (excluding the two
  timing fields). They must match exactly before the old targets are deleted.
- Re-run `build/targets/round-trip.test.ts` unchanged against the Python-produced
  artifacts — it already exists specifically to catch a drift like this, straight into a
  real `ArtifactKnowledgeSourceAdapter.create()` call.
- Update `pipeline.test.ts`, `pipeline.chain.test.ts`, and
  `pipeline.kernel-failure.test.ts` to mock the subprocess boundary instead of
  `@duckdb/node-api`.

## Phase 5 — Wire it into every real execution path

- **Local dev:** document the one-time `uv sync` (or equivalent) setup in
  `docs/operations/DEVELOPER-WORKFLOW.md`'s "Requirements" section; fail `pnpm
build:knowledge` early and clearly if `python3` or the pipeline's dependencies are
  missing.
- **CI:** add `actions/setup-python` next to `actions/setup-node` in whatever workflow
  runs `pnpm release:verify`, installing Python dependencies before that step.
- **Vercel:** prepend a Python dependency install to `vercel.json`'s `installCommand`
  (plain `pip install` or `uv sync` — not the Vercel Python Functions feature, which is
  for live functions this project doesn't need here).
- **Local Studio publish flow:** interface unchanged; now implicitly depends on `python3`
  being on the `PATH` of whatever shell runs `next dev`.

## Phase 6 — Where the Python move actually pays off

With the contract proven, the roadmap's named-but-unbuilt targets
(`SearchIndexBuildTarget`, `StatisticsBuildTarget`, `EmbeddingBuildTarget`,
`VectorIndexBuildTarget`) become natural additions to `pipeline/` — pandas/polars for
statistics, a Python embeddings library for `EmbeddingBuildTarget` — built in the
language the data/science work was always going to be easier in, without having
duplicated the Kernel to get there.
