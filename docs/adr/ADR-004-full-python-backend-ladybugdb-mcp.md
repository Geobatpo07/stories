# ADR-004: Full Python backend, LadybugDB as the knowledge store, and an authoring MCP

- **Status:** Proposed
- **Date:** 2026-10-21
- **Supersedes:** ADR-003 (Python owned only the two Build Targets; this widens the
  boundary to the whole backend and changes the storage engine)
- **Relates to:** ADR-001, ADR-002

## Context

ADR-003 scoped the Python move to `build/`'s two targets only, because `kernel/`,
`runtime/`, `authoring/`, and `auth/` looked too tightly coupled to the Studio's live
React forms to move without duplicating business logic. Three things changed that
calculus:

1. **The scope is now explicitly "the whole background."** `app/`, `components/`, and the
   public Presentation layer stay Next.js/React; everything else — Kernel, Runtime,
   Authoring, Auth, Build — becomes a Python service.
2. **LadybugDB replaces DuckDB as the knowledge store**, not just as a build target.
   LadybugDB is an embedded, in-process property-graph database (an open-source,
   Cypher-query successor to Kuzu, the Apple-discontinued graph database it forked from
   in 2025) with native Python _and_ Node.js client bindings, and documented
   interoperability with Parquet/Arrow/DuckDB. That last point matters architecturally:
   Stories' actual domain model already is a graph (`kernel/pipeline/relationships.ts`,
   `kernel/pipeline/graph.ts`, and `ArtifactKnowledgeSourceAdapter`'s `createGraph()`
   today hand-roll adjacency maps in JS over two flat DuckDB tables purely to simulate
   one). A native graph engine with `getParents`/`getChildren`/`getRelated` expressed as
   Cypher `MATCH` patterns is a better fit for the actual data shape than the current
   relational-plus-reconstruction approach — this is a genuine architectural improvement,
   not just a language swap.
3. **A new MCP server** should let Claude browse the knowledge graph for context, draft a
   Knowledge Object after a research-topic brainstorm, and publish it — through the exact
   same validation and versioning path as the Studio, at the same trust level as the
   single admin account (per `auth/README.md`: "This is a private research notebook, not
   a SaaS product").

Three facts already on record in this repo still constrain the design:

- `runBuildPipeline()`'s caller, `authoring/workflow.ts`'s `publish()`, is awaited
  in-process with no `try`/`catch`; whatever replaces it must preserve that
  success/failure contract.
- The public website is statically generated and, per `DEPLOYMENT.md`, needs no live
  backend "for ordinary page requests" — only at build time. This is worth preserving:
  it is why the site has no always-on cost or failure surface today, and nothing about
  moving the _authoring_ side to Python requires giving that up for the _public_ side.
- The Studio is dev-only in production today specifically because a Vercel serverless
  function can't durably write local disk (`AUTHORING-STUDIO.md`, `auth/README.md`).
  Moving authoring to an always-on Python service actually _removes_ that constraint —
  Studio and the MCP server can both run against a real, long-lived backend in
  production, which is new and worth calling out as a capability gain, not just a port.

## Decision (revised: LadybugDB and DuckDB combined, not either/or)

LadybugDB becomes the Python backend's own internal knowledge graph — the thing
`kernel/`, `authoring/`'s relationship pickers, and the MCP's `search_knowledge` query
against with Cypher. **DuckDB stays the one and only generated public artifact** —
`knowledge.duckdb` + `manifest.json`, same two-table schema, same contract
`ArtifactKnowledgeSourceAdapter` already checks. The Python build pipeline's last step
exports the validated LadybugDB graph into that unchanged DuckDB shape, the same way
`duckdb-target.ts` exports the Kernel's in-memory JS graph into it today. This is a direct
continuation of ADR-001's framing — "DuckDB is a generated index, disposable and
rebuildable" — it just gains one more layer underneath it (LadybugDB) without changing
what gets generated or who reads it.

The payoff: **`ArtifactKnowledgeSourceAdapter`, `lib/duckdb/client.ts`, and everything in
`app/`/`components/` that depends on them need zero changes.** Next.js never opens
LadybugDB, never adds its Node binding as a dependency, and never has to reason about its
concurrent-read behavior — because it never touches it. That retires the Phase 0 risk
from the first draft of this ADR entirely (see "Open question," revised below): LadybugDB
only ever needs to support one Python process reading and writing it at a time, which is
the easy case, not the hard one.

```text
┌─────────────────────────────┐        ┌───────────────────────────────────────┐
│ Next.js — UNCHANGED          │        │ Python service (new)                   │
│                               │        │                                         │
│ app/, components/,           │        │ schemas/  (Pydantic)                    │
│ lib/presentation/             │        │ kernel/   (parse, validate, normalize;  │
│                               │        │            relationships validated in   │
│ ArtifactKnowledgeSourceAdapter│  build  │            Python, then stored as      │
│ + lib/duckdb/client.ts read   │  time   │            LadybugDB edges)            │
│ knowledge.duckdb + manifest   │◀───────│ LadybugDB: the authoritative graph —    │
│ exactly as today — no code    │  writes │   nodes + edges, queried via Cypher by  │
│ change, no new native         │  the    │   authoring/ and the MCP server         │
│ dependency, no network call   │ artifact│ build/ (Python): LadybugDB → export →   │
│ for an ordinary page request. │         │   knowledge.duckdb + manifest.json      │
│                               │         │   (unchanged shape/contract)            │
│ app/studio/** (React forms)   │────────▶│ runtime/  (ports, composition root)     │
│ calls the Python API for      │  HTTP   │ authoring/ (workflow, repository,       │
│ every authoring/auth action    │         │   MDX-source renderer)                 │
│ that today hits                │         │ auth/ (sessions, password hashing,     │
│ app/api/studio/**,              │         │   Supabase)                            │
│ app/api/auth/** locally.        │         │ FastAPI: /api/studio/**, /api/auth/**  │
│                                  │         │ MCP server: imports authoring/          │
│                                  │         │   directly, in-process — Claude and     │
│                                  │         │   the Studio UI share one authoring     │
│                                  │         │   implementation, queried via Cypher.   │
└─────────────────────────────┘        └───────────────────────────────────────┘
```

### Per-module mapping

- **`schemas/` + `domain/*/schema.ts` (Zod) → Pydantic models.** Mechanical, one model per
  entity, same fields, same base-schema inheritance shape. This is the piece most exposed
  to silent drift (two schema languages describing the same contract), so Phase 1 below
  adds a contract test before anything else is built on top of it — mirroring the
  discipline `build/targets/round-trip.test.ts` already applies to the artifact contract.
- **`kernel/` (discovery, parsing, normalization, validation) → Python.** Parsing moves
  from `gray-matter` to `python-frontmatter` (or an equivalent hand-rolled YAML
  frontmatter split, since the format is simple). Normalization and field validation are
  direct ports. **Relationship resolution changes shape, not just language:** today's
  `resolveRelationships()` (closed-world map lookup, raising a friendly
  `KnowledgeRelationshipError` on a dangling slug) stays as a Python pre-validation pass
  — before anything is loaded into LadybugDB — so authoring still gets the same friendly
  "Choose a published record for this field" message instead of a raw graph-engine error.
  Once validated, relationships become native LadybugDB edges, and `getParents` /
  `getChildren` / `getRelated` become Cypher `MATCH` queries instead of hand-rolled
  adjacency maps.
- **`build/` → Python, output artifact unchanged.** The pipeline now has two stages
  instead of one: load the validated graph into LadybugDB (nodes + edges, queryable via
  Cypher for the Studio and the MCP server), then export that graph into
  `knowledge.duckdb` + `manifest.json` in exactly today's shape — same two tables, same
  columns, same manifest fields. `build/targets/round-trip.test.ts` does not need a new
  artifact shape to prove; it keeps proving the same contract it already proves today,
  just against a pipeline whose internals changed.
- **`runtime/`'s Persistence/Search/Export/Logging/Configuration/Clock/Identifier ports →
  Python**, as the new service's internal DI. `ArtifactKnowledgeSourceAdapter` and
  `lib/duckdb/client.ts` do **not** move and do **not** change — Next.js keeps reading
  `knowledge.duckdb` exactly as it does today. This is what keeps "no live backend for an
  ordinary page request" true after the move, and it means the Node.js side never needs
  a LadybugDB binding at all.
- **`authoring/` → Python**, including `MDXRenderer`. Worth noting explicitly: this
  renderer only ever produces MDX _source text_ (frontmatter + body string templating —
  see `mdx-renderer.ts`, no JSX, no compilation) — it has nothing to do with the MDX
  _rendering_ Next.js does to display a published article, which is unaffected and stays
  entirely client-side. This is a low-risk, mechanical port.
- **`auth/` → Python.** Password hashing (`scrypt` + constant-time compare, both
  available in Python's standard library via `hashlib.scrypt`/`hmac.compare_digest`),
  opaque session tokens, and the same Supabase PostgREST HTTP calls (`httpx`, matching
  today's deliberate choice to call the REST API directly rather than depend on an SDK).
  `middleware.ts` keeps running on Next.js's Edge runtime exactly as it does today, but
  its session check becomes a `fetch` to the Python API's session-validation endpoint
  instead of a direct `SupabasePersistenceAdapter` call — the Edge runtime can call an
  external HTTP API just as easily as it calls Supabase's today, so this seam costs
  nothing.
- **`app/api/studio/**`, `app/api/auth/**`** are deleted; `components/authoring/`'s forms
  call the Python API's equivalent routes instead. Same-origin routing (so cookies and
  CORS stay simple) is handled with Vercel's **Services** feature, which runs a Python
  backend and a Next.js frontend as two independently-built parts of one project under a
  shared domain — the natural fit here, and the reason ADR-003's note that "this doesn't
  need Vercel's Python Functions feature" no longer applies: this time the Python side
  genuinely needs to be a live, reachable service, not a build-time-only script.

### The MCP server

A new, small Python package exposing tools over MCP, built directly on top of the ported
`authoring/` package — in-process imports, not a second HTTP round-trip to the service's
own API, so the Studio UI and Claude always go through one authoring implementation, never
two:

- `search_knowledge(query, kind?)` / `get_entity(slug)` — read access to the graph for
  brainstorming context, backed by LadybugDB Cypher queries.
- `create_draft(kind, fields, content)` — same `AuthoringWorkflow.createDraft` /
  `saveDraft` path the Studio uses.
- `validate_draft(id)` — surfaces the same friendly field- and relationship-validation
  issues the Studio's live form validation shows.
- `publish(id)` — the same transactional publish: render MDX, write it, rebuild the
  LadybugDB artifact, roll back on failure. No shortcut path that skips validation.

Because this reuses the Studio's single-admin trust model exactly, the MCP server needs
its own credential (a scoped API token issued by `auth/`, not the admin's interactive
session) — add that as a new, narrow `auth/` capability rather than reusing session
cookies, which don't make sense for a local MCP client.

### Search: graph-aware ranking, still a static artifact

Today's search is primitive and has nothing to do with the graph: `lib/presentation/search.ts`
is a pure in-memory text scorer (title/summary/excerpt/tag substring and prefix matching)
run over a minimized server projection of records, and `lib/search/README.md` is an
unimplemented stub noting DuckDB full-text search or an in-memory index as candidates.

**Decision: implement the roadmap's already-named `SearchIndexBuildTarget` in the Python
build pipeline, after the LadybugDB graph is built and validated, and keep its output
inside the same static artifact Next.js already reads** — not a live query path. Concretely:
once entities and relationships are loaded into LadybugDB, run graph traversals (the
`getRelated`-equivalent Cypher queries, optionally weighted by relationship field,
cardinality, or hop distance) to compute per-entity relevance signals — "what else is
this connected to, and how strongly" — and persist them into `knowledge.duckdb` itself,
either as extra columns/a new table alongside `knowledge_entity` and
`knowledge_relationship`, or combined with DuckDB's full-text search extension for the
text-matching half. The exact schema is a detail to settle during Phase 3, not here; the
principle is fixed: **one artifact, still static, still read with zero live backend
dependency for an ordinary search request** — extending the same property the rest of
this ADR already preserves for content pages to search as well.

`lib/presentation/search.ts`'s role shrinks accordingly: once ranking is substantially
computed at build time, it becomes a thin presentation-layer step (tie-breaking,
formatting) rather than the whole algorithm — or it's replaced outright if the
precomputed ranking is already good enough. Not an urgent decision; revisit once
`SearchIndexBuildTarget` exists and its output can be looked at directly.

## Open question to resolve before committing engineering time

Earlier drafts of this ADR treated "LadybugDB as the public artifact, read concurrently
by many Next.js function instances" as the goal, which depended on a concurrent
read-only access model LadybugDB's docs don't actually describe. Combining the two
stores (as decided above) removes that dependency entirely: LadybugDB only ever needs to
support one Python process at a time, reading and writing its own working graph — a far
lower bar, and one every embedded graph database, however young, is built to clear.

What's left to confirm in a much smaller Phase 0 spike: that LadybugDB's Python client
can (a) bulk-load nodes/edges from the Kernel's validated entities, (b) answer the
Cypher-equivalent of `getParents`/`getChildren`/`getRelated` correctly, and (c) export
cleanly into the existing DuckDB two-table shape. None of this touches Next.js or
production concurrency at all.

## Consequences

- Two deployables instead of one; the Python service must now stay warm in production
  (for the Studio and the MCP server), which `build/`'s Python move under ADR-003 never
  required. New operational surface: uptime, logging, and incident response for a service
  that didn't exist before.
- Schema drift risk is real and ongoing, not one-time: Pydantic and any schema that still
  exists in TypeScript (there shouldn't be any left once domain/*/schema.ts is retired)
  must be kept in lockstep. Since nothing in TypeScript should need these schemas anymore
  under this ADR's scope, this risk mostly disappears once the migration completes — the
  intermediate state, while both exist, is where to be careful.
- LadybugDB is a young project (2025 fork of a discontinued product). Smaller ecosystem
  and community than DuckDB, which is deeply battle-tested. Combining the two stores
  contains that risk: LadybugDB's blast radius is now limited to the Python service
  (authoring + MCP), and a LadybugDB bug or outage never reaches the public site, which
  keeps reading the DuckDB artifact exactly as it does today regardless of what happens
  upstream. DuckDB remaining battle-tested at the one point that matters most for
  uptime (serving the public site) is the main reason this combination is worth
  preferring over an either/or choice.
- The single-admin, zero-extra-dependency philosophy in `auth/README.md` ("zero new
  dependencies") is harder to keep completely literally in Python — e.g., `httpx` isn't
  stdlib the way `fetch` is in Node — but the _spirit_ (no auth framework, no ORM, direct
  HTTP calls to Supabase/Resend) survives the port intact.
- Gain: the Studio and the new MCP server can both work in production, not just locally —
  removing a real limitation (`V3-RELEASE-NOTES.md`: "disabled on public production
  deployments by default") as a side effect of this move, not its goal.
- The public site's deployment story (`DEPLOYMENT.md`) does not change at all: it still
  builds and reads `knowledge.duckdb` the same way, with no new native dependency and no
  new concurrency question to reason about.

## Explicitly unchanged

`content/` and `knowledge/` remain the Git-versioned source of truth per ADR-001/ADR-002
— this ADR changes _who writes and reads the generated graph artifact and the authoring
logic_, not where canonical research content lives or how its audit trail works. The
single-admin authentication model (`auth/README.md`) is ported, not redesigned — the MCP
server is a second _client_ of that model, not a second _user_.

---

# Migration plan

Builds on ADR-003's phase discipline (prove parity before deleting anything; reuse the
existing `round-trip.test.ts` pattern for every new artifact contract) but widens it to
the full scope.

## Phase 0 — Small spike, not a go/no-go gate

Build a minimal LadybugDB graph from Python (a handful of entities across two or three
kinds, with relationships), query it via Cypher for the equivalent of `getParents` /
`getChildren` / `getRelated`, and export it into the existing two-table DuckDB shape.
Confirm a Node.js process reading that exported `knowledge.duckdb` (unchanged
`@duckdb/node-api` code) sees exactly what `ArtifactKnowledgeSourceAdapter` expects. This
is a same-day spike, not a project-blocking risk, since nothing about it touches
production concurrency.

## Phase 0 results — GO, with four corrections

Run against a hand-written fixture (8 entities, 4 kinds, 10 edges) on branch
`spike/ladybugdb-phase0`, uncommitted. Load, Cypher-query (`getParents`/`getChildren`/
`getRelated`, verified as sets against a Python mirror of `createGraph()`), export to
`knowledge.duckdb` + `manifest.json`, and a real `ArtifactKnowledgeSourceAdapter.create()`
call against the exported file — all passed. Bulk-load volume, reopen-after-close, and
concurrent access were explicitly not tested (consistent with Phase 0's narrow goal). **Go.**

Four corrections, two confirmed independently against the repo on `main` (commit
`48c2145`) and PyPI, two taken as reported from the spike's own empirical results:

1. **DuckDB storage-format skew — confirmed real, needs to be a standing CI check, not a
   one-time pin.** Python `duckdb` 2.0.0 wrote a file Node's `@duckdb/node-api` (pinned at
   `1.5.5-r.1` in `package.json`) rejected; pinning Python to `duckdb==1.5.2` fixed it.
   This isn't a settled fact to pin once and forget — DuckDB's on-disk format has changed
   across releases before, and nothing stops a future `pnpm up` or `pip install -U`
   silently reintroducing the mismatch on either side. **Action for Phase 1:** pin both
   packages explicitly with a comment explaining why, and add a CI step that writes with
   the pinned Python `duckdb` and reads with the pinned `@duckdb/node-api` on every run —
   not just locally once.
2. **`build/targets/round-trip.test.ts` does not need to be written — it already exists.**
   Checked directly against `main` at commit `48c2145`: the file is there, 114 lines, and
   does exactly what `build/README.md` and this ADR already described — builds a two
   -entity fixture, runs `duckDBBuildTarget` and `manifestBuildTarget`, then calls the real
   `ArtifactKnowledgeSourceAdapter.create()` and asserts entities, relationships,
   `getParents`/`getChildren`, and metadata round-trip correctly. The spike's report that
   it "doesn't exist" doesn't match what's on `main` — worth reconciling locally (check for
   an uncommitted local deletion, a stale or shallow clone, or a different branch than
   `main` in whatever checkout the spike ran against) before Phase 1 assumes a test needs
   to be written from scratch. If `main` genuinely has it, **Phase 3 reuses this exact
   file, pointed at the new Python producer, rather than writing a new one** — that was
   always the plan (see Phase 3 above), and nothing here changes it.
3. **Two tables or four — open, needs a Phase 1 decision.** The Python/LadybugDB export
   wrote four tables; `ArtifactKnowledgeSourceAdapter` only ever reads `knowledge_entity`
   and `knowledge_relationship` (the other two are presumably LadybugDB's own Parquet/
   Arrow/DuckDB interop bookkeeping, not yet confirmed). Decide explicitly in Phase 1
   whether the artifact contract requires an **exact** two-table file or tolerates a
   **superset** — and write that decision into `build/README.md`'s contract section once
   made, since right now it only documents two tables existing, not whether others are
   forbidden.
4. **Confirmed independently via PyPI: install with `pip install ladybug`, not
   `ladybugdb` or `real-ladybug`.** The real distribution is named plainly `ladybug`
   (latest `0.21.2`, Python 3.10–3.14, MIT license), published by the LadybugDB
   Developers at `github.com/LadybugDB/ladybug-python`. Worth being deliberate about this
   in `pyproject.toml`/`requirements.txt` and any setup docs — "ladybug" is a generic
   enough word that pinning the exact package name (not just trusting an import
   statement to resolve correctly) avoids anyone accidentally reaching for the wrong
   project later.

Also worth carrying into Phase 2/3 design, not just noted and dropped: Cypher has no
implicit ordering, so the spike's set-based comparison against `createGraph()` is right
for Phase 0 but any real export needs explicit `ORDER BY` clauses to match
`ArtifactKnowledgeSourceAdapter`'s own `ORDER BY created_at DESC, id ASC` /
`ORDER BY source_id, target_id, field` reads exactly; and the spike's manifest content
hash is simplified and not yet the same algorithm `manifest-target.ts` uses today
(`contentHash()` in that file) — Phase 3's export stage needs to match it exactly, since
nothing re-derives or re-validates it beyond a presence check today.

## Phase 1 — Schema contract

Port `schemas/` and every `domain/*/schema.ts` to Pydantic. Add a contract test — e.g.
generate a handful of representative fixtures, validate them against both the (still
present, not yet deleted) Zod schemas and the new Pydantic models, and assert identical
accept/reject behavior — before any downstream phase builds on the Pydantic models.

## Phase 2 — Kernel port

Port discovery, frontmatter parsing, normalization, and field validation to Python,
keeping `resolveRelationships()`'s closed-world validation (friendly error on a dangling
slug) as a pre-LadybugDB pass. Defer relationship _storage_ to Phase 3.

## Phase 3 — Build pipeline: LadybugDB in, unchanged DuckDB artifact out

Write the LadybugDB-backed graph stage (nodes + edges loaded via Cypher after Phase 2's
validation), then the export stage that writes `knowledge.duckdb` + `manifest.json` in
today's exact shape. Run the existing `build/targets/round-trip.test.ts` unchanged against
this new pipeline's output — it was already designed to catch exactly this kind of
producer swap. Once it passes: delete `@duckdb/node-api` from the **Python** side's old
TypeScript equivalent code paths being retired (`build/duckdb/connect.ts`,
`build/targets/duckdb-target.ts`, `build/targets/manifest-target.ts` in the TS codebase).
`ArtifactKnowledgeSourceAdapter` and `lib/duckdb/client.ts` are never touched.

Implement `SearchIndexBuildTarget` as part of this same phase, not a later one: it needs
the same validated LadybugDB graph the DuckDB export needs, so building it alongside
avoids a second pass over the graph. Settle its exact schema (extra columns, a new table,
or DuckDB FTS) here, and extend `round-trip.test.ts`'s style of contract-locking to
whatever reads it.

## Phase 4 — Authoring and auth

Port `authoring/` (repository, workflow, `MDXRenderer`) and `auth/` (passwords, sessions,
Supabase calls) to Python behind FastAPI routes matching today's `app/api/studio/**` /
`app/api/auth/**` shapes closely enough that `components/authoring/`'s forms need minimal
changes beyond their base URL. Wire `middleware.ts` to call the new session-validation
endpoint. Delete the old Next.js API routes once the Studio UI is repointed and passing
its existing tests against the new backend.

## Phase 5 — MCP server

Build the MCP package directly on the Phase 4 authoring module (in-process import). Define
and document its tool list (`search_knowledge`, `get_entity`, `create_draft`,
`validate_draft`, `publish`), issue it a scoped API credential distinct from the admin's
interactive session, and test the full brainstorm-to-publish path end to end against a
disposable content tree before pointing it at the real one.

## Phase 6 — Deployment

**Recommendation: Vercel Services**, one project, two services, same domain.

```json filename="vercel.json"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "services": {
    "web": { "root": "./" },
    "api": { "root": "backend/", "entrypoint": "main:app" }
  },
  "rewrites": [
    { "source": "/api/studio/(.*)", "destination": { "service": "api" } },
    { "source": "/api/auth/(.*)", "destination": { "service": "api" } },
    { "source": "/mcp/(.*)", "destination": { "service": "api" } },
    { "source": "/(.*)", "destination": { "service": "web" } }
  ]
}
```

Why this fits better than a separate host, for this project specifically:

- **Same domain, no CORS, cookies keep working.** `/api/studio/**` and `/api/auth/**`
  route to the Python service but are indistinguishable from same-origin calls to the
  browser — `middleware.ts`'s session cookie behavior is unaffected.
- **The MCP server doesn't need its own deployment.** Mount it as another route on the
  same FastAPI app (e.g. `/mcp`, MCP-over-HTTP) and expose it with one more rewrite.
  Claude (Desktop, Code, or claude.ai via a remote MCP connector) points at
  `https://<domain>/mcp` with its own bearer token — no third deployable, no separate
  place for it to go stale.
- **LadybugDB's ephemeral-instance question stops mattering once it's treated as a
  cache, not a store.** Fluid compute (default on new Vercel projects, supported for the
  Python runtime) keeps a function instance warm across multiple requests and shares
  resources between concurrent invocations — so in the common case, a Python instance
  that already rebuilt its LadybugDB graph on a cold start keeps serving from that warm
  instance for a while, not rebuilding it on every single request. On an actual cold
  start, the rebuild-from-source approach already decided in Phase 2/3 (LadybugDB is
  rebuilt from `content/`, `knowledge/`, and Supabase drafts — never the durability layer
  itself, exactly like the Kernel's in-memory JS graph today) means a fresh instance is
  always correct, just momentarily slower. Benchmark this rebuild time against the real
  content volume before assuming it's negligible — see the note below.
- **Internal bindings** are available if any part of the Python service ever needs to
  call another internal service privately (not relevant yet with just these two, but
  worth knowing if, say, the build pipeline becomes its own service later).

Two things worth being clear-eyed about:

- **Services is in Beta** (all Vercel plans) as of this writing — newer and less
  battle-tested than Vercel's core Next.js/Functions path, which is itself a
  consideration alongside LadybugDB's youth, not a reason to avoid it outright for a
  single-admin tool with no uptime SLA.
- **Fluid compute is not a guaranteed always-on server.** It reduces cold starts and
  shares warm instances across concurrent requests, but an idle instance can still be
  recycled, and horizontal scale-out spins up additional instances that each rebuild
  their own LadybugDB graph independently. If the knowledge base grows large enough that
  this rebuild becomes noticeably slow (worth an explicit benchmark once real content
  volume exists), the fallback is a small always-on host (Fly.io, Render, a VPS) for just
  the Python service, keeping one LadybugDB instance warm indefinitely — at the cost of a
  second deployment pipeline, a second domain, and CORS. Not needed to start.

Local development: `vercel dev` (or `vercel dev -L` to skip Vercel Cloud auth) runs both
services together with bindings auto-injected, replacing today's single `next dev`.

Update `DEPLOYMENT.md`, `DEVELOPER-WORKFLOW.md`, and CI to reflect two services, two test
suites (`pytest` for the Python service, `vitest` for Next.js), and the new
session-check path in `middleware.ts`.
