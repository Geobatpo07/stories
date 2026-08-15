# build/ — the Knowledge Artifact Pipeline

Compiles the Kernel's in-memory Knowledge Graph into deterministic, disk-based artifacts:
`database/generated/knowledge.duckdb` and `database/generated/manifest.json`. A third,
independent consumer of `@/kernel`, sibling to `domain/*/service.ts` and `runtime/` — not
a layer "below" either. Contains no business logic of its own; it orchestrates a registry
of **Build Targets** around data the Kernel already validated and resolved.

## Dependency direction

`build/**` depends only on `@/kernel` (its public barrel) and `@duckdb/node-api` directly
— never `domain/*`, `app/`, `components/`, `lib/search`, `lib/metadata`, or
`lib/duckdb` (see `lib/duckdb/client.ts`'s doc comment for why: that client is a
read-only, process-lifetime singleton for the running app; the build needs a writable
connection it fully owns the lifecycle of, so it opens its own `DuckDBInstance` via
`build/duckdb/connect.ts`).

## Why this exists as a separate step, not part of the Kernel or the Runtime

The Kernel only ever holds knowledge in memory, for one process's lifetime — it has no
concept of "disk artifact" at all (see `kernel/README.md`). The Runtime's production
knowledge source (`ArtifactKnowledgeSourceAdapter`, `runtime/adapters/`) only ever
_reads_ a manifest and a database file — it never writes one, and never talks to the
Kernel directly. Something has to sit between them, on a different cadence (build time,
not request time): read the Kernel once, write the artifacts the Runtime will later
trust without re-validating. That's this package.

## Contract with `ArtifactKnowledgeSourceAdapter` (the one reader)

This is the one part of `build/` that must never drift silently — a mismatch here is a
production incident (the Runtime rejects the artifact) rather than a compile error, so
`build/targets/round-trip.test.ts` chains this pipeline's output straight into a real
`ArtifactKnowledgeSourceAdapter.create()` call as a standing regression check.

**`database/generated/knowledge.duckdb`** — two tables, columns and order fixed by the
adapter's `SELECT`s:

```sql
knowledge_entity (id, kind, slug, title, summary, status, created_at, updated_at, content, file_path, metadata JSON)
knowledge_relationship (source_id, target_id, field, cardinality)
```

`metadata` holds the `KnowledgeEntity.metadata` record exactly as the Kernel produced it
— the adapter spreads it back onto the reconstructed entity (`...metadata`), which is how
per-kind fields like `theme` or `programSlug` survive the round trip without a column of
their own.

**`database/generated/manifest.json`** — satisfies `KnowledgeSourceMetadata`
(`runtime/ports/types.ts`) plus an `artifacts` map:

```ts
{
  platformVersion, kernelVersion, buildVersion, schemaVersion: string;
  generatedAt: string; contentHash: string; generationDuration: number;
  knowledge: { entities: number; relationships: number };
  artifacts: { knowledgeDatabase: { file: string; checksum: string } };
}
```

The adapter re-verifies the database file's SHA-256 against `artifacts.knowledgeDatabase.checksum`
and the row counts against `knowledge.{entities,relationships}` before trusting the
artifact at all — both must be exact, not approximate.

## Rebuild philosophy

No incremental writes: every run does `DROP TABLE IF EXISTS` + `CREATE TABLE` +
repopulate from the Kernel's current in-memory graph (ADR-001: "delete and rebuild is
always exact"). `database/generated/*` is gitignored and disposable — deleting it and
running `pnpm build:knowledge` must always reproduce it.

## `runBuildPipeline()` never rejects for a content problem

`authoring/workflow.ts`'s `AuthoringWorkflow.publish()` awaits `runBuildPipeline()` with
no surrounding `try`/`catch` and decides whether to roll back a publication purely from
`result.success`. So a Kernel validation/parse/relationship error is caught inside
`runBuildPipeline()` and reported as a `validationIssues` entry with `success: false` —
never thrown. Only a genuine infrastructure failure (disk I/O, a DuckDB crash) is allowed
to reject, and even those should be rare given target `run()` methods are the only place
that can throw.

## Build Targets: how new artifacts become pluggable

`build/targets/registry.ts` is the only place target order is decided — `runBuildPipeline()`
(`build/pipeline.ts`) loops over it generically:

```ts
interface BuildTarget {
  readonly name: string;
  run(context: BuildTargetContext): Promise<BuildTargetOutcome>;
}
```

`BuildTargetContext` carries the loaded `entities`/`graph`, the resolved output
directory, a shared `artifacts` map targets can publish to and read from (the Manifest
target reads the DuckDB target's checksum this way — DuckDB must run first, hence its
position in `registry.ts`), and the pipeline's `startedAt` timestamp. If a target fails,
every later target is recorded as skipped rather than run.

**To add a target:** one file implementing `BuildTarget` under `build/targets/`, one
entry appended to `registry.ts`. No orchestrator change. Named candidates from
`docs/roadmap/ROADMAP.md`: `SearchIndexBuildTarget`, `GraphBuildTarget`,
`StatisticsBuildTarget`, `EmbeddingBuildTarget`, `VectorIndexBuildTarget`.

## Testing

Co-located `*.test.ts` next to source (matches `kernel/`/`runtime/`'s convention). Run
with `pnpm test`. `pipeline.test.ts` is an integration test against the real (possibly
empty) `content/` tree, mirroring `kernel/api.test.ts` — only the output location is
redirected to a temp directory so the suite never writes into the working tree's
`database/generated/`. Kernel-failure and target-chain-skip behavior are each isolated in
their own file (`pipeline.kernel-failure.test.ts`, `pipeline.chain.test.ts`) since they
use `vi.mock`, which is file-scoped. `targets/round-trip.test.ts` is the contract lock
described above.

## Developer workflow

1. `pnpm typecheck && pnpm lint && pnpm test` — the fast local loop.
2. `pnpm build:knowledge` (`build/cli.ts`) — runs the real pipeline against `content/`,
   prints a human-readable report (`renderReport()`), exits non-zero on failure. This is
   the command `pnpm build`, `pnpm release:verify`, and production deploys all depend on
   completing successfully before Next.js ever collects a page.
