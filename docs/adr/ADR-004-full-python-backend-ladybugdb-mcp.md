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
  available in Python's standard library via `hashlib.scrypt`/`hmac.compare_digest` — mind
  the salt-as-literal-hex-string trap the Phase 4 audit confirmed empirically), opaque
  session tokens, and the same Supabase PostgREST HTTP calls (`httpx`, matching today's
  deliberate choice to call the REST API directly rather than depend on an SDK). **Revised
  by the Phase 4 audit: `middleware.ts` is NOT changed.** It already calls
  `SupabasePersistenceAdapter` directly from the Edge runtime today — not through any
  application backend — so adding a `fetch` to a new Python session-validation endpoint
  would add a network hop to every `/studio` request that doesn't exist today, for no
  benefit. Python just needs to write session rows into the same Supabase table, in the
  same shape, and the existing Edge check keeps working untouched.
- **`app/api/studio/**`, `app/api/auth/**`** are deleted; `components/authoring/`'s
  form-_submission_ code calls the Python API's equivalent routes instead. **Revised by the
  Phase 4 audit:** the Studio's Server Components (`app/studio/(protected)/**/page.tsx`)
  are a second consumer the earlier draft of this ADR missed — they read
  `authoring/server.ts` in-process today for data, not through any API route, so they need
  to be rewritten to call the Python API too, not just repointed. A new
  `GET /api/authoring/definitions` endpoint replaces the unported `kernel/authoring.ts` as
  the single source of form field definitions, read by both the Studio's form rendering and
  Python's own validation. Same-origin routing (so cookies and CORS stay simple) is handled
  with Vercel's **Services** feature, which runs a Python backend and a Next.js frontend as
  two independently-built parts of one project under a shared domain — the natural fit
  here, and the reason ADR-003's note that "this doesn't need Vercel's Python Functions
  feature" no longer applies: this time the Python side genuinely needs to be a live,
  reachable service, not a build-time-only script. **Publishing a document to production is
  not a local file write** (confirmed by the Phase 4 audit: Vercel's deployment filesystem
  is read-only, which is already why drafts live in Supabase and why publishing only ever
  worked in local dev) — Python commits the rendered MDX to `main` via the GitHub API,
  which triggers Vercel's existing Git-integrated redeploy, and separately calls a small,
  secret-protected Next.js route to run `revalidatePath` (Python cannot call it directly).
  This makes publication asynchronous — complete on a redeploy, not on the API call
  returning — which the Studio UI and the Phase 5 MCP `publish` tool both need to reflect.

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
  deployments by default") as a side effect of this move, not its goal. **Caveat added by
  the Phase 4 audit:** this was never actually true for _publishing_, only for drafting —
  Vercel's read-only deployment filesystem blocks `AuthoringWorkflow.publish()`'s direct
  file write in either language, which is why it only ever worked in local dev. Decided
  above: publishing in production goes through a GitHub API commit instead, which makes it
  asynchronous (a redeploy, not an instant write) rather than purely a backend-language
  change.
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

## No TypeScript/Python duplication left standing

A porting phase is not done when Python code exists and its own tests pass. It is done
only when one of two things is also true: the real TypeScript caller has been repointed
to delegate to Python (as `lib/python-api.ts` did for the three Studio Server Components
in step 2d), or the old TypeScript implementation has been deleted. A Python port with no
repointed caller is an incomplete phase, not a separately-closed one — it is tested dead
code until proven otherwise, and future phase reports must say explicitly, for every
route or component touched, which of the two is now true rather than stopping at "the
Python side works."

Two kinds of duplication are accepted, both narrow and named, everything else is not:

- **Temporary, bounded to one phase's cutover window.** TypeScript and Python run the
  same logic in parallel only long enough for characterization tests to prove Python
  matches TypeScript's real behavior, before the real caller is repointed and the
  TypeScript implementation is deleted (Phase 7). This is the existing phase discipline
  above, restated, not a new rule.
- **Narrow, pure, and contract-tested.** A client-side function with no side effects and
  no business rules beyond shaping data, kept on both sides because a round trip to
  Python would cost latency a person typing in a form would notice — `createDraft()`
  building an empty draft's in-memory shape is the one instance so far. Guarded by a
  cross-language contract test mirroring `fixtures/authoring-contract`, so drift between
  the two sides fails a test instead of silently diverging.

One exception is permanent, not decay to watch for: `middleware.ts` and
`auth/server.ts`'s session check call Supabase directly and will never delegate to
Python (see "Explicitly unchanged" above). The Edge runtime runs on every request,
including every public page; adding a network call to a second service there would add
latency and a new failure mode to all site traffic for a check that must stay minimal.
This was decided, not overlooked.

**Resolved by the write-path audit below, and it is the bad case:** all six write routes
(`app/api/studio/documents/route.ts`, `.../[id]/publish/route.ts`, and the four
`app/api/auth/**` routes that change state) still run their original TypeScript logic
on every branch checked, including the most recent one (step 2d). The Python ports built
in steps 2a/2c (`backend/api/app.py`) are complete and pass their own tests but are called
by nothing — exactly the "tested dead code" this section warns against, not a hypothetical.
See "Phase 4, write-path audit results" below for the finding and the decision taken.

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
3. **Two tables, not four — resolved by reading the shipped code, not by a Phase 1
   decision.** Confirmed directly in `build/targets/duckdb-target.ts` on `origin/main`
   (commit `48c2145`): the pipeline creates exactly `knowledge_entity` and
   `knowledge_relationship`, with no `PRIMARY KEY` and no `NOT NULL` anywhere. There is no
   `knowledge_snapshot` or `knowledge_metadata` table, and no superset question to settle —
   the spike's four-table export was built from a schema file that was never actually part
   of the committed pipeline (see "Phase 2.5 reconciliation," below). `build/README.md`'s
   contract section already matches this; nothing needs to change there. Phase 3's Python
   exporter should create exactly these two tables, with the same absence of constraints
   (the adapter's reads are all `ORDER BY`-qualified `SELECT`s, so nothing relies on a
   primary key).
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

## Phase 2.5 reconciliation — one real finding, and two decisions Phase 3 must make

Phase 1 and Phase 2 were carried out against a local checkout whose `main` had drifted from
`origin/main`, and whose on-disk `build/` mixed 20 files genuinely tracked on `origin/main`
with 39 files that were never committed anywhere (stale leftovers from an earlier,
abandoned design — `build/duckdb/schema.ts`, `build/hash/*`, `build/manifest/*`,
`build/pipeline/*`, among others). Phase 0's spike and part of Phase 1's analysis read that
stale, uncommitted `build/` rather than the real one. Verified directly against
`origin/main` at commit `48c2145` (`git ls-files build` vs. `git ls-files --others
--exclude-standard build`): 20 files tracked, 39 untracked and uncommitted. This is now
corrected (see point 3, above, and the two findings below). Nothing else in this ADR's scope
was affected — `schemas/`, `domain/`, and `kernel/` were read from the real, tracked source
throughout, and the Phase 1/Phase 2 contract tests pass unchanged against a clean
`origin/main` checkout (610 Vitest tests, 1 intentionally skipped; 765 pytest tests).

Two genuinely real findings came out of re-reading the actual shipped `build/` and
`kernel/`, independent of this migration and already true of the live site today:

- **Kind-specific frontmatter fields are silently dropped on every DuckDB round-trip.**
  `kernel/pipeline/factory.ts`'s `createEntity()` only ever puts `{ tags }` into
  `entity.metadata`; everything else (`theme`, `leadResearcher`, `programSlug`, `venue`,
  `noteType`, ...) is spread onto the entity's top level instead. `duckdb-target.ts` only
  ever serializes `entity.metadata` into the `metadata` JSON column, so those fields never
  reach `knowledge.duckdb`, and `ArtifactKnowledgeSourceAdapter`'s `hydrateEntities()` can
  only reconstruct what it reads back from that column. Measured end to end: a Kernel
  entity with `theme: "Climate"` comes back `theme: undefined` after the artifact round
  trip, and `app/programs/[slug]/page.tsx` falls back to "Open inquiry" / "Not specified".
  `build/targets/round-trip.test.ts` doesn't catch it because its fixture places `theme`
  directly inside `metadata`, which the real factory never does. **This is a live
  production bug today, unrelated to this migration.**
- **No duplicate-id check exists anywhere in the shipped pipeline — and it does not "keep
  the last one," it duplicates.** This corrects an imprecise claim in an earlier draft of
  this ADR. Verified directly against `origin/main`: `kernel/loaders/load-all.ts`'s
  `loadAllUncached()` builds its entity list with `registrations.flatMap(...)` and
  `resolveRelationships()` (`kernel/pipeline/relationships.ts`) returns `entities.map(...)`
  — same length as its input, never deduplicated by id. `build/targets/duckdb-target.ts`
  then does `context.entities.map(entityValues)` and inserts every row — so two entities
  sharing an id become **two rows with the same id** in `knowledge_entity`, not one
  surviving row. Confirmed empirically in Phase 3.5 (below): on a real duplicate-id
  fixture, the TypeScript pipeline exits 0 and writes 2 rows with the same id; it does not
  pick a winner. Separately, and inconsistently: `kernel/pipeline/graph.ts`'s
  `buildKnowledgeGraph()` builds `nodes = new Map(...)`, keyed by id — `Map.set` on a
  repeated key overwrites, so the **in-memory graph view** (`getParents`/`getChildren`/
  `getRelated`, and anything reading `KnowledgeGraph.getNode`) silently shows only
  whichever duplicate came last in iteration order. The two surfaces of the same data
  disagree with each other today: the persisted artifact has both rows, the graph API
  exposes only one. A `duplicate-ids` check existed only in the stale, uncommitted
  `build/pipeline/checks/` directory — it was never part of what ships.

**Decided (2026-10-22):**

1. **Fix the `theme`-loss (and other kind-specific-field-loss) bug now, in TypeScript,
   as a standalone change independent of this migration** — it is a real, user-visible bug
   on the live site today, and there is no reason to ship a Python port that faithfully
   reproduces it. The fix: `kernel/pipeline/factory.ts`'s `createEntity()` folds `extra`
   into `metadata` as well as the top level (`metadata: Object.freeze({ tags:
frontmatter.tags, ...extra })`), so `duckdb-target.ts` — which already serializes all of
   `entity.metadata` — captures every kind-specific field without any change to `build/` at
   all. `ArtifactKnowledgeSourceAdapter.hydrateEntities()` already spreads `...metadata`
   back onto the top level on read, so this one-line change closes the loop without
   touching the adapter either. `round-trip.test.ts`'s existing fixture (which places
   `theme` inside `metadata`) stops being an artificial shortcut and becomes an accurate
   description of the real contract once this ships.
2. **Add a duplicate-id check to the Python build pipeline** — a new, stricter behavior
   than today's TypeScript pipeline (which writes duplicate rows rather than keeping a
   single "last" entity — see the correction above). Since the
   Python side is new code, not a port of an existing check, this is a plain validation
   step in the Phase 3 build pipeline: collect entities by id while loading them into
   LadybugDB, and raise a clear, Kernel-error-style message (file paths of both
   conflicting sources, not just the id) on a collision, before anything is written to the
   graph.

Because this hotfix changes `createEntity()`'s actual output, it also changes the "golden
reference" behavior Phase 2's Python Kernel port was built against. Phase 3 must open by
re-diffing the Python entity factory against the _hotfixed_ TypeScript factory (not the
pre-fix one Phase 2 copied) and updating the one line that doesn't match, before doing
anything else.

Two smaller, mechanical notes for Phase 3's exporter, from re-reading every use of
`filePath`/`sourcePath` in the tracked codebase: (a) it is written and read but never
compared anywhere, so a Linux-built artifact using forward slashes and a Windows-built one
using backslashes don't conflict today — but a byte-for-byte diff between the TS and Python
producers (Phase 3's own validation step) should normalize or skip that column rather than
assume it matches; (b) the real `contentHash()` sorts entities with `localeCompare`, which
is locale-dependent — a Python reimplementation needs to pin a specific, explicit collation
rather than rely on its own sort matching Node's in every environment.

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

Before writing the exporter: confirm the TypeScript hotfix from "Phase 2.5 reconciliation"
(kind-specific fields folded into `metadata`) has landed, re-diff the Python entity factory
against it, and implement the duplicate-id check as part of the LadybugDB load stage —
both decided in that section above.

Implement `SearchIndexBuildTarget` as part of this same phase, not a later one: it needs
the same validated LadybugDB graph the DuckDB export needs, so building it alongside
avoids a second pass over the graph. Settle its exact schema (extra columns, a new table,
or DuckDB FTS) here, and extend `round-trip.test.ts`'s style of contract-locking to
whatever reads it.

## Phase 3 results — done, uncommitted upstream

Completed on branch `migration/phase3-build-pipeline` (fresh clone, local commit `d742f59`,
not pushed). Full report with raw output under every claim: `backend/PHASE3-FINDINGS.md`;
logs in `backend/evidence/phase-3/`. Independently re-verified against the real
`origin/main` / `origin/migration/phase-2.5-reconciliation`:

- The kind-specific-metadata-loss fix is merged to `origin/main` (merge commit `2969512`)
  exactly as specified — confirmed by reading `kernel/pipeline/factory.ts` on `origin/main`
  directly: `metadata: Object.freeze({ tags: frontmatter.tags, ...extra })`.
- `backend/` (Phase 1 + Phase 2) lives on `origin/migration/phase-2.5-reconciliation`
  (`60d30a2`) — confirmed pushed and present, 56 files, matching what the Phase 2.5 report
  described.

The Phase 3 branch itself is local-only and could not be independently verified file-by-file
(it hasn't been pushed), but the report is evidence-backed in the same style as Phase 2.5's
reconciliation, including honest negative results: raw `.duckdb` bytes differ between
producers even with identical logical content (expected — not a bug), and `file_path`
differs across OS path separators and is excluded from the diff, as decided above. Headline
results: the Step 0 re-sync against the hotfixed factory changed exactly 2 golden fixtures;
the duplicate-id check (decided above) is implemented and names both conflicting files in
its error message; the DuckDB export is checked against the real TypeScript `CREATE TABLE`
strings by a test, not by inspection; `contentHash` matches the real `manifestBuildTarget`'s
output; `round-trip.test.ts` passes against the Python producer via an added producer
switch, with its assertions untouched; the DuckDB version-skew CI check runs locally
(Windows/Python 3.13/Node 22) but not yet on the Linux/Python 3.12/Node 20.9 matrix this
project actually targets in CI.

A real performance finding, not anticipated by this ADR: naive per-row `executemany` into
DuckDB from Python scales badly (~9s for 100 entities, ~328s for 5,000) because of per-value
module probing in the DuckDB Python client; batching each table into a single bound JSON
parameter brought 5,000 entities down to ~6.5s (synthetic data). Worth re-validating against
real content volume once `content/` is populated, but the shape of the fix is already known.

Explicitly not yet true, by the report's own account: this pipeline is not wired into
`pnpm build:knowledge`, `vercel.json`, or `authoring/` — the TypeScript build pipeline is
still what ships, and no TypeScript build target has been deleted. `content/` is empty in
this environment, so all checks ran against fixtures and the performance benchmark is
synthetic. LadybugDB has only been exercised in-memory, not with on-disk persistence. The
search index's relevance weights are the author's own design, unevaluated, and nothing
downstream consumes them yet. Full-text search is not implemented.

## Phase 3.5 results — wired in behind a flag, validated on empty real content

Completed on top of Phase 3's commit (`d742f59`), local commit `17efb8c`, not pushed.
`STORIES_BUILD_PRODUCER` controls `build/cli.ts`: unset or `typescript` is today's exact
behavior; `python` shells out to `python -m pipeline.cli --root <cwd>` (run from `backend/`,
interpreter from `STORIES_PYTHON` or `backend/.venv`); any other value fails loudly instead
of silently falling back. `vercel.json` is untouched, so production's default is unchanged.
A new `pnpm build:knowledge:parity` script (`backend/tools/artifact-parity.sh --repo`) builds
both producers from the real `content/`/`knowledge/` trees into throwaway directories (never
touching `database/generated/`) and diffs the result; a CI step runs it on pull requests to
`main` (unexecuted on GitHub itself — no Linux access in this environment — but its commands
were run by hand on Windows via git-bash).

Confirmed by the report, and consistent with everything already independently verified
about this codebase: the TypeScript path is byte-for-byte unchanged on `ok-full` (identical
report, identical full-dump sha256 including `file_path`); `PARITY OK` on the real repo,
both producers reading as `contentHash e3b0c442…` (the empty-input hash) because `content/`
currently holds only `.gitkeep` placeholders — **0 entities**, so this validates the wiring
and the schema, not real content processing; `PARITY OK` also on the synthetic `ok-full`
fixture (15 entities) through the actual flag, not just Phase 3's standalone script.
`knowledge/` is confirmed unread by either producer (one stale draft JSON, documented in its
own README as a legacy location). Python is ~0.7s slower per run, attributed to interpreter
startup and importing LadybugDB/DuckDB, not to per-entity cost.

The duplicate-id finding above (rows duplicated, not "last wins") came out of this phase:
on real content the check trivially passes (there's nothing to collide, since there are no
entities), but on the test fixture, the Python path exits 1 naming both files and writes no
artifact, while the TypeScript path exits 0 and writes two rows sharing an id — corroborated
by direct inspection of `kernel/pipeline/relationships.ts`, `build/targets/duckdb-target.ts`,
and `kernel/pipeline/graph.ts` on `origin/main`, not just the report's own claim.

Not done, by the report's own account: no CI run on actual GitHub infrastructure; no
real-content-volume benchmark (`content/` is empty); Python 3.12/Node 20.9 still untested
(only 3.13/22 available); production's default producer is still TypeScript, and no
TypeScript target has been removed. The report explicitly leaves one thing for a decision
here rather than acting on its own: validating the Python producer against real content
requires `content/` to actually have content, and none was added.

## Phase 4 audit — findings that revise this ADR's Phase 4/5 plan

Done as a read-first audit before writing any Phase 4 application code, on branch
`migration/phase4-audit` (from `17efb8c`, local commit `14b98fc`, not pushed) —
`backend/PHASE4-AUDIT.md`. Only one claim was tested empirically (password
compatibility); the rest comes from reading the code, and most of it is independently
re-confirmed directly against `origin/main` below.

- **Password hashing is Python-compatible, confirmed empirically and independently.**
  `auth/passwords.ts` derives via `scryptAsync(password, salt, KEY_LENGTH)` where `salt`
  is a hex **string**, passed straight into `crypto.scrypt` — not decoded first. Four
  hashes generated by the real TypeScript code (including a password with
  `é–日本語🙂` and a 200-character one) were independently verified against Python's
  `hashlib.scrypt`. **The trap, confirmed by reading `passwords.ts` directly: the salt
  must be used as the literal hex-string bytes on the Python side too — decoding it to 16
  raw bytes first (the "obvious" reading of a hex-encoded salt) silently produces the
  wrong hash.** Today's admin password keeps working across the port.
- **Studio pages bypass `app/api/studio/**` entirely for reads — a second consumer the ADR
  didn't account for.** Confirmed directly: `app/studio/(protected)/page.tsx`,
  `documents/[id]/page.tsx`, and `new/[kind]/page.tsx` are Server Components that import
  `knowledgeObjectRepository`/`authoringWorkflow` **in-process** from `authoring/server.ts`
  — which itself constructs a `SupabasePersistenceAdapter` directly — not a `fetch` to any
  API route. Only form _submissions_ go through `app/api/studio/**`. This ADR's Phase 4
  text ("`components/authoring/`'s forms call the Python API's equivalent routes") only
  covers the submission half; the page components themselves need to become API callers
  too, which is a real rewrite of those Server Components, not a backend-only change.
- **`kernel/authoring.ts` (193 lines, confirmed) is unported** and is the single source
  driving both the Studio's form rendering (`AuthoringFieldDefinition`/
  `AuthoringEntityDefinition`) and friendly field validation. Two independent copies (one
  per language) would drift the moment a field is added or changed — needs one source of
  truth, not two ports.
- **Publishing cannot work against a Vercel production deployment, in either language, and
  this is a pre-existing constraint, not one this migration introduces.** Confirmed
  directly: `authoring/server.ts`'s own doc comment says Vercel's serverless filesystem is
  read-only outside `/tmp`, which is exactly why _drafts_ already live in Supabase — but
  `AuthoringWorkflow.publish()` still calls `writeFile()` straight into `content/`,
  **"never through this port."** That only works in local dev today (consistent with
  `V3-RELEASE-NOTES.md`: Studio is disabled in production by default). This ADR's framing
  — "Studio and MCP server can both run against a real, long-lived backend in production...
  a capability gain" — is only true for drafting; publishing to a Git-tracked `content/`
  has no solution yet in either language, and it directly blocks Phase 5's actual goal
  (Claude publishing via MCP in production, not just drafting).
- **`revalidatePath` can't be called from Python.** Confirmed: it's invoked in
  `app/api/studio/documents/[id]/publish/route.ts`, not in `authoring/workflow.ts` itself
  — a Python-driven publish needs some secret-protected callback into a small Next.js
  route whose only job is cache invalidation.
- **Middleware should probably stay as-is — a correction to this ADR's existing plan, and
  independently confirmed sound.** Read directly: `middleware.ts` already talks to
  Supabase's REST API directly from the Edge runtime via `SupabasePersistenceAdapter` —
  it does not and never has called into any application backend for a session check. This
  ADR's Phase 4 text proposes replacing that with a `fetch` to a new Python
  session-validation endpoint, which would add a network hop to every single `/studio`
  request that doesn't exist today, for no benefit, as long as Python writes session rows
  into the same Supabase table in the same shape. This should be reversed.
- **Test coverage is thin exactly where the risk is highest**: the six `app/api/studio/**`
  routes and `middleware.ts` have no tests today. Characterization tests against the real
  TypeScript behavior should exist before any of it is replaced.
- `KNOWLEDGE-AUTHORING.md` is stale (still describes drafts as living in
  `knowledge/<kind>/`, not Supabase) — a docs fix, not a design question.

**Decided (2026-10-22):**

1. **Publishing in production commits through the GitHub API.** The Python service holds a
   scoped GitHub token and creates a commit on `main` with the rendered MDX file (add/
   update/delete, mirroring today's `writeFile`/`unlink` pair in `authoring/workflow.ts`),
   which triggers Vercel's existing Git-integrated redeploy. This keeps `content/` exactly
   what ADR-001/002 already say it is — the Git-versioned source of truth — and is the only
   one of the three options that lets the Phase 5 MCP server actually publish from
   production, not just draft. Trade-offs to design for explicitly: publication is no
   longer instant (a redeploy, not a file write — the MCP `publish` tool and the Studio UI
   both need to say "publishing..." and poll or webhook for completion, not assume it's
   done when the call returns); the GitHub token is a new secret with write access to
   `main` and needs the same care as the Supabase service-role key; every publish is a
   commit, so history grows at the rate of publications (acceptable — that's already true
   of every other content change to this repo).
2. **Middleware keeps reading Supabase directly — the ADR's original plan (a Python
   session-validation endpoint) is reversed.** No change to `middleware.ts` itself; Python
   must write session rows into the same Supabase table, in the same shape, so the
   Edge-runtime check that already works today keeps working unmodified.
3. **Form field definitions are served by Python over HTTP**, e.g.
   `GET /api/authoring/definitions`, replacing `kernel/authoring.ts` as the single source —
   both the Studio's form rendering and Python's own friendly-validation messages read from
   it. No generated file, no build step to remember to re-run.
4. **First code pass: characterization tests on the six `app/api/studio/**` /
   `app/api/auth/**` routes and `middleware.ts` first, locking today's real behavior,
   before writing a line of the Python auth core.** Consistent with every prior phase of
   this migration (prove parity before replacing).

Still open, raised by the audit but not a Phase 4 blocker on its own: the Studio's Server
Components (`app/studio/(protected)/**/page.tsx`) read `authoring/server.ts` in-process
today and must be rewritten to call the new Python API instead — this is additional
frontend work Phase 4 needs to scope for, beyond "point the existing forms at a new base
URL."

Not verified by the audit (stated plainly, not glossed over): no test ran against a real
Supabase project (row shapes are read from code, not observed); Vercel Services itself is
still unverified end-to-end; the Studio pages and editor were read only for their imports
and `fetch` calls, not exercised.

## Phase 4, step 1 results — 138 characterization tests, one live vulnerability found

Done on top of the audit commit (`14b98fc`), local commit `a7732bf`, not pushed —
`backend/PHASE4A-FINDINGS.md`, evidence in `backend/evidence/phase-4a/`. No production file
was touched (not the six routes, not `middleware.ts`, not `authoring/workflow.ts`, not
`auth/passwords.ts`), and no Python code was written — 138 new tests, `pnpm test` at 759
passed / 1 skipped (was 621/1). Three seams are faked (an in-memory Supabase table, a
Resend recorder, and a cookie jar built on Next's own real `ResponseCookies` so the
serialized `Set-Cookie` text is genuine); the publish tests run the real TypeScript build
in a temp directory, exercising the actual write/rollback path. Twelve behaviors were
temporarily mutated as negative controls (threshold, status codes, cookie flags, `restore()`
removed, etc.) and all twelve broke at least one test before being reverted — real
mutation-testing discipline, not just a pass count.

**Independently re-verified against `origin/main`, and the most important finding is a
real, live, currently-exploitable issue, unrelated to this migration:**

- **The login rate limiter can be used to lock out the real admin.** Confirmed directly in
  `app/api/auth/login/route.ts`: `rateLimited(email)` is checked _before_
  `authWorkflow.login(email, password)` runs, keyed only by the submitted email string —
  with no distinction for whether that email is even registered, and no IP component at
  all. `MAX_ATTEMPTS = 10` per 15-minute window. **Anyone who knows (or guesses) the admin's
  login email can send 11 unauthenticated POST requests and lock the real admin out for 15
  minutes — repeatable indefinitely.** This is independent of the Python migration and live
  on the site today. A decision on this is below.
- Malformed JSON on any of the four body-reading routes is an uncaught `request.json()`
  rejection → Next returns 500, not 400 — confirmed, no `try`/`catch` around the parse.
  Low severity (not attacker-actionable beyond a slightly wrong status code), but now
  locked by a test either way.
- `auth/workflow.ts`'s `confirmPasswordReset()` calls `this.resetTokens.consume(token)`
  unconditionally, before checking expiry or email match — confirmed in the source. An
  expired or mismatched token is deleted the moment it's presented, even though it was
  already unusable. Since tokens are 32 random bytes (unguessable), this isn't a practical
  attack path, just a quirk — e.g. a double-submitted confirm request would fail on the
  second attempt.
- `app/api/studio/documents/route.ts`'s `POST` accepts client-supplied `publicationState`
  and `publication` fields as-is (both optional in `draftSchema`, passed straight to
  `saveDraft()`) — confirmed. A request could mark a draft "published" in the repository
  without ever going through the real `publish()` workflow (MDX render, build, revalidate).
  Since this never touches `content/`, the public site is unaffected — it's an internal
  Studio bookkeeping inconsistency, not a site-integrity issue, and single-admin-trust
  scoped.
- Confirmed exactly: `GET`/`POST /api/studio/documents` check `isStudioEnabled()`, then the
  session, then parse the body (404, then 401, then 400, in that order).

Other now-locked behavior from the report, not independently re-verified line-by-line but
consistent with everything already confirmed: exact `Set-Cookie` serialization order
(`Path; Expires; Secure; HttpOnly; SameSite=lax`; logout's clearing cookie omits
`HttpOnly`/`SameSite`); the build fails if any of the 9 `content/<kind>` directories is
missing; `middleware.ts` throws (500) on a corrupted session row instead of denying
gracefully, treats `expiresAt == now` as expired, never compares the row's own `token`
field to the cookie, and never deletes expired session rows.

**Decided (2026-10-22): fix the login rate-limiter now, in TypeScript, as a standalone
change independent of this migration, keyed by IP** — it's live, unauthenticated, and
trivially exploitable, the same urgency class as the `theme`-loss fix earlier. An attacker
can then only lock out their own IP, never the admin's account from anywhere. The other
three behaviors above (malformed-JSON 500, unconditional token consumption,
client-controlled `publicationState`) are left as documented, low-severity quirks to simply
not replicate when Phase 4 step 2 writes the Python auth core — no separate TypeScript
hotfix needed for those.

Not observable in this step, as expected: real HTTP-layer `Set-Cookie` bytes (handler-level
only, not `next start` + a real client); a real Supabase project (fake assumes JSON
round-trip, id-ascending list order, `undefined` for a missing row); a real Resend call;
cross-instance/cross-restart rate limiting (in-memory, per-process); anything on
non-Windows; the Studio's Server Components (out of scope, per the audit's F1); whether the
new middleware accepts a session row written by a real production login (fixture-derived,
per the audit's own caveat).

Two fixture contracts now exist for step 2 to honor exactly: `fixtures/auth-contract`
(6 committed scrypt vectors) and `fixtures/authoring-contract` (9 entity kinds + 4
validation cases from `kernel/authoring.ts`) — each has a TODO pointing at
`backend/PHASE4-AUDIT.md` for the Python-side test step 2 must add against them.

## Phase 4, step 2a results — Python auth/authoring core, publish still stubbed

Done on `migration/phase4-auth-port` (`9af1ba6`, on top of `0ab37d8` = `a7732bf` +
cherry-picked `282f4de`), not pushed — `backend/PHASE4B-FINDINGS.md`, evidence in
`backend/evidence/phase-4b/`. No existing TypeScript file changed (`pnpm test`: 766
passed/1 skipped before and after — the 7-test increase over step 1's 759 is the
rate-limiter hotfix's expanded login test file, already accounted for). New: `auth/`
(passwords, types, repository, workflow), `authoring/` (definitions, validation, MDX
rendering, repository, workflow — publish stops short of the file write), `runtime/`'s
Supabase/Resend adapters over `httpx`, and `api/app.py` serving all six routes plus the new
`GET /api/authoring/definitions`. `pytest`: 1,096 passed (817 before). `ruff`/`mypy --strict`
clean on all new code — not configured at all before this phase, now is; the pre-existing
Python code from earlier phases does NOT pass this new configuration (65 ruff findings, 22
mypy errors) and was deliberately left untouched, a gap to close later rather than silently
fixed here.

Beyond porting the existing characterization tests, this phase added independent
cross-language contract checks: 98 generated cases for `email`/`datetime`/`uuid`/min-length
validators checked against the real Zod output (0 mismatches); 8 MDX-rendering cases
byte-identical to the real `MDXRenderer` (line endings, BOM, NBSP, quotes, control
characters, emoji, empty bodies, one error case); the full 9-kind/4-case authoring contract,
key order included; all 6 scrypt vectors. Fifteen negative controls (cookie attribute
order, rate-limiter keyed by email again, missing-IP fallback removed, limiter moved after
password check, reset token not consumed, sessions not destroyed, unknown-email disclosure,
logout not destroying the session, 400-before-401, salt decoded from hex, 32-byte key
length, `strip()` swapped in for JS's `trim()` semantics, a definition label changed, the
path guard removed) each broke at least one test before being reverted.

**Three further findings, independently re-verified directly against `origin/main`:**

- **A second real, pre-existing TypeScript bug, now confirmed.**
  `authoring/workflow.ts`'s `friendlyRelationshipMessage()` matches responses against
  `/field "([^"]+)" points to missing target "([^"]+)"/` — but the real error it's matching
  against, `KnowledgeRelationshipError` (`kernel/errors.ts`), produces `Entity "..." has a
dangling reference in "field": target "..." does not exist.` — a string the regex can
  never match. Every relationship-validation failure in the Studio has always fallen
  through to a generic message instead of naming the field and target. Confirmed by reading
  both the regex and the real error format side by side — the regex genuinely cannot match
  that message. Low severity (UX only, no functional or security impact); ported faithfully
  with a test, left as a separate decision rather than silently fixed.
- **Password minimum length counts UTF-16 code units, confirmed in
  `app/api/auth/reset-password/confirm/route.ts`:** `z.string().min(8)`, and JavaScript
  string length counts UTF-16 units — so four astral-plane emoji (each a surrogate pair)
  satisfy `min(8)` as "8 characters." Reproduced and checked against real Zod.
  Low severity, simply worth knowing before anyone is tempted to "fix" it as an
  inconsistency during the port.
- **The publish stub's blanket 422 matches real behavior exactly:** confirmed directly in
  `app/api/studio/documents/[id]/publish/route.ts` — any thrown error, of any kind, becomes
  `{ error: message }` at status 422. The Python stub's `NotImplementedError` → 422 is not a
  workaround, it's what the real route already does on any failure.

Documented adaptations, not TypeScript-behavior claims: Python reads `STORIES_ENV`
(`production`/`development`/`test`, defaulting by `VERCEL` presence) in place of
`NODE_ENV`, driving the cookie's `Secure` flag, Studio enablement, and the rate-limiter
fallback — same IP-only design as the hotfix, never email, shared deny-by-default bucket
without a trusted IP source. `GET /api/authoring/definitions` was given the same
404-then-401 guard as the documents routes, a judgment call since nothing specified it.
Two `NotImplementedError` stubs mark where Phase 2b plugs in:
`PublicationTarget.publish(rendered, previous_path) -> report` (the GitHub commit) and an
async revalidation callback. `materialize_authoring_objects` does not build the knowledge
graph, unlike the TypeScript version, because nothing reads it on this path. Draft sorting
approximates `localeCompare` — exact for UUIDs and ISO timestamps, unverified against ICU
for arbitrary strings.

Coverage, from the report's own table: login, logout, reset-password, confirm, and
documents GET/POST are fully ported (31/6/12/19/27 tests). `publish` has only its guard and
validation tests (4) — the file write, real build, and rollback (3 TS tests) don't exist in
Python yet; they return once the real publish target lands. `middleware.ts` stays
TypeScript, untouched; this phase checked a Python-written session row has the expected
shape but did not run the real middleware against one. Not done or observed, same caveats
as every phase before it: nothing has run against a real Supabase or Resend; routes were
exercised via Starlette's `TestClient`, not `uvicorn` or a real Vercel deployment; only
Python 3.13 was used; the `python-artifact` CI job will pick these tests up but hasn't run
on GitHub itself; login tests take ~50s since each does a real scrypt computation.

## Phase 4, step 2c results — GitHub-API publish implemented, never run against real GitHub

Done on `migration/phase4-github-publish` (`d57ca21`, on top of `9af1ba6`), not pushed —
`backend/PHASE4C-FINDINGS.md`, evidence in `backend/evidence/phase-4c/`. Both stubs from
step 2a are implemented; everything runs against an in-memory fake GitHub
(`backend/tests/github_fake.py`) — the real GitHub API has never been called. `pytest`:
1,125 passed (1,096 before). `pnpm test`: 777/1 skipped (766 before) — two new files only,
the revalidation route and its test; nothing existing changed. `ruff`/`mypy --strict` clean
on the new code.

**Design, and why:** fetch the branch head and its tarball (Vercel's filesystem is
read-only and ephemeral, ruling out a synced local clone), extract only `content/`'s
regular files into a temp directory with path-traversal/absolute-path/symlink guards and a
200MB cap, apply the change, then run the real Phase 3 Python build pipeline against it —
duplicate-id check included. Only if that passes does it commit: one Git Data API tree
(covering both the new/changed file and, if the slug changed, the old path's removal via
`sha: null`), one commit whose parent is the snapshotted head, one unforced ref update. If
the branch moved underneath it, the ref update fails closed ("nothing was published, try
again") rather than overwriting. Identical content commits nothing at all (verified: a
retry after a failed Supabase save is a no-op, not a duplicate commit). The stored
`publication` row keeps `publicationState: "published"` even though nothing is visibly live
yet — the existing TypeScript app reads this field through a closed enum, and a real commit
genuinely has happened; this is a deliberate, explicitly limited choice pending the
deployment-tracking work below, not an oversight.

**GitHub API research:** chose the Git Data API (tree + commit + ref update) over the
Contents API specifically for atomicity — a slug change needs both an add and a delete, and
GitHub's own Contents API docs are cited as requiring such operations to be serialized or
risk a conflict, which the Git Data API's one-tree-one-commit shape avoids entirely. I could
not independently re-fetch GitHub's exact doc text myself (a tool permission gate blocked
it), but an open, actively-discussed GitHub issue independently corroborates the underlying
mechanism (concurrent Contents API writes to the same branch conflicting on the blob
`sha`), and the tree+commit+ref-update pattern chosen here is the standard, well-established
approach other git-backed publishing tools use for exactly this atomicity guarantee — the
architectural choice is sound independent of pinning the literal citation. Explicitly
unconfirmed by the report itself and worth checking on first real use: whether the tarball
endpoint accepts a commit SHA, the archive's root folder naming, the exact status code for a
non-fast-forward ref rejection (409 and 422 are both treated as a conflict, defensively),
and one additional permission the ref-update endpoint might require (its docs page was
truncated) — to be confirmed via the `X-Accepted-GitHub-Permissions` response header.
Needs a real, human-created fine-grained token (`contents: read/write`, scoped to this one
repo, stored as `GITHUB_PUBLISH_TOKEN`) before any of this can run for real — none exists
yet, none is hardcoded.

**Revalidation route** (`app/api/internal/revalidate/route.ts`, new): compares
`x-revalidate-secret` against `REVALIDATE_SECRET` by hashing both with SHA-256 before
`timingSafeEqual` (equalizes length, avoids both a length-mismatch exception and a timing
leak), calls only `revalidatePath("/", "layout")`, returns 401 on a wrong secret and 503 if
unconfigured (fails closed), and is deliberately not covered by `middleware.ts` (it's a
service-to-service call, not a user session). The Python side calls it fire-and-forget after
a successful commit; a failure is logged, never surfaces as anything other than 200 to the
publish caller.

**Two residual risks, both already self-identified and tracked, not new surprises:**

- **Pre-commit validation runs the Python build pipeline, not the TypeScript one
  `vercel.json` actually deploys with.** Content that passes this check could still fail the
  real Vercel build — which is exactly the production-build-fidelity question Phase 7
  already gates on (real-content parity, full CI matrix) before TypeScript's build pipeline
  is retired. This doesn't make the publish path unsafe today (a failed Vercel build simply
  doesn't go live; the site keeps serving its last good deployment), but it does mean a
  "successful" publish response here is not yet a guarantee of a successful deployment.
- **Revalidating immediately after the commit cannot make the new content appear** — the
  MDX only reaches the site once Vercel's next deployment for that commit is live;
  revalidating now just re-caches the _current_ (old) deployment's output. The call is
  wired per the original design, but its real trigger point belongs to the deployment-
  tracking work, explicitly out of scope here.

Fourteen negative controls were tried; thirteen caught immediately (ignoring a failed
build, persisting state after a failed commit, forcing the ref update, dropping the delete
entry or the commit's parent, recommitting identical content, deleting an absent path,
omitting the token, swallowing a revalidation failure, dropping the deployment status field,
and three TypeScript ones: `===` instead of constant-time comparison, a changed
`revalidatePath` argument, a missing secret no longer refusing). The fourteenth — removing
the archive path-traversal guard — survived alone because a second, independent
normalization guard behind it still catches the same case; removing both together does fail
a test. Reported honestly rather than silently dropped, which is exactly the right call.

One flaky test, pre-existing from step 1 (a 404-unless-exactly-"true" Studio-enablement
check that reloads its route's graph four times), timed out once under load past its 5s
limit and passed on retry including in the final check — not touched, correctly left alone
rather than loosened to hide the flake.

Not done or observed, consistent with every phase before it: the real GitHub API, a real
token, real branch protection, real rate limits, and the tarball-by-SHA endpoint have never
been exercised; Vercel deployment-status tracking and automatic rollback of a commit whose
deployment fails remain explicitly out of scope; Python 3.12/Linux/the `python-artifact` CI
job have not run (Python 3.13, Windows only, as before).

## Phase 4, step 2d results — Studio frontend repointed to the Python API

Done on `migration/phase4-frontend-repoint` (`e8a480f`), not pushed. The three Studio
Server Components (`app/studio/(protected)/page.tsx`, `documents/[id]/page.tsx`,
`new/[kind]/page.tsx`) no longer import `knowledgeObjectRepository`/`authoringWorkflow`
in-process from `authoring/server.ts` — this was the second consumer the Phase 4 audit
flagged (the first being the `/api/studio/*` routes themselves, already ported). They now
call the Python API over HTTP, through a new `lib/python-api.ts` helper. `pnpm test`:
800/1 skipped (777 before) — new files only, nothing existing changed. `pytest`: 1,130
passed (1,125 before).

**`lib/python-api.ts` design:** Server Components don't get cookies forwarded
automatically on a server-to-server `fetch()`, so the helper reads the session cookie via
`cookies()` from `next/headers` and attaches it as an explicit `Cookie` header on every
call to the Python API. Errors from the Python side are mapped to the same shape the
Studio pages already handled from the old in-process path, so the pages' existing
error-rendering branches didn't need to change.

**Unplanned but necessary: CORS.** The Python API and the Next.js app aren't on the same
origin in this topology, so a CORS-permissive middleware had to be added on the Python
side for these calls to succeed at all. Reasoned correctly: `Access-Control-Allow-Origin`
is scoped to the Studio's own origin (not `*`), because it must be combined with
`Access-Control-Allow-Credentials: true` to carry the session cookie, and the CORS spec
forbids pairing a wildcard origin with credentialed requests.

**`SameSite=lax` limitation, correctly identified and deferred, not fixed here:** the
session cookie is `SameSite=lax`, which still rides along on these calls today because
Server Component server-to-server calls aren't the cross-site top-level navigation
`SameSite=lax` is designed to block — but a genuinely cross-domain deployment (Python API
on its own subdomain, per the Phase 6 Vercel Services plan) could put this on the wrong
side of that line. Correctly scoped out of this step and flagged for Phase 6, not treated
as resolved.

**Negative controls:** 10/10 caught on the new `lib/python-api.ts` cookie-forwarding and
error-mapping logic. 3/4 caught on the CORS middleware; the survivor was reported as an
equivalent mutant (a change that alters the code without altering any observable behavior
the test suite can distinguish — e.g. reordering two header-set calls — rather than a gap
in coverage) and the reasoning for calling it equivalent was included rather than asserted.

**First real end-to-end exercise of login + Python API together:** a manual test against
a fake Supabase/PostgREST (not a unit or characterization test) logged in through the
existing TypeScript `/api/auth/login` route, then loaded a Studio page that fetches
through the new Python path — the first time in this migration that the TypeScript-issued
session cookie and the Python API have been exercised together end-to-end, even in a fake
environment.

**`newStudioDraft` left as-is, flagged as an open question by the report:** the Studio's
"new document" flow still calls TypeScript's `createDraft()` directly rather than a Python
route, because no Python draft-creation route exists yet. Decision: no new route is
needed. `createDraft()` is pure and deterministic — it builds an in-memory draft shape
client-side and persists nothing until the existing (already-ported) save path is called
— so duplicating its logic in TypeScript carries no correctness risk the way a persisting
operation would. Adding a Python route here would force a decision (should an empty draft
be persisted server-side on creation?) that nothing in this migration currently needs
answered. Instead: add a cross-language contract test mirroring the existing
`fixtures/authoring-contract` pattern, asserting the TypeScript `createDraft()` shape and
the Python schema it will eventually be saved against stay in sync, so future drift is
caught instead of silently diverging.

**Pre-existing, unrelated to this change, noted for completeness:** Next.js's streaming
SSR can commit an HTTP 200 status before a Python API error thrown deeper in the tree is
rendered, because the route's `loading.tsx` Suspense shell is sent to the client first.
This is a property of Next.js App Router streaming generally, not something this phase's
changes introduced or could fix at this layer.

Not done or observed, consistent with every phase before it: auth forms (login, reset,
logout) still call TypeScript's `/api/auth/*` routes, not Python — explicitly out of
scope for this step; Vercel deployment-status tracking, the revalidation call's real
trigger point, real Supabase/GitHub/Resend/Vercel validation, and the full CI matrix
remain open, tracked against Phase 7's gating criteria as before.

## Phase 4, write-path audit results — confirmed: every write route is still TypeScript

Audit only, no code changed, verified by reading `git show <branch>:<path>` on each of the
five local branches that had never been pushed (`migration/phase3-build-pipeline`,
`migration/phase4-audit`, and steps 2a/2c/2d), then pushed as-is as PRs
[#7](https://github.com/Geobatpo07/stories/pull/7)-[#11](https://github.com/Geobatpo07/stories/pull/11)
(all diverged from `main` at `2969512`, before this migration's own fixes; none merged).
Findings file: `backend/PHASE4-WRITE-PATH-AUDIT.md` on branch
`migration/phase4-write-path-audit` (`93e2b0b`). Independently re-verified against the real
pushed code, not just the report's narrative: confirmed by reading
`app/api/auth/login/route.ts`, `app/api/studio/documents/route.ts`, and
`app/api/studio/documents/[id]/publish/route.ts` directly on `migration/phase4-frontend-repoint`
— all three import only `@/auth/server` / `@/authoring/server`, no Python client.

**The answer, confirmed on every one of the five branches:** all six write routes
(`studio/documents` POST, `.../publish`, `auth/login`, `auth/logout`,
`auth/reset-password`, `.../confirm`) still run their original TypeScript logic. The Python
ports in `backend/api/app.py` (steps 2a/2c) implement all six endpoints, under the same
paths, and pass their own tests — and are called by nothing. This is the "tested dead code"
this ADR's duplication policy warns against, confirmed as real rather than hypothetical.

**What is actually rewired, confirmed by reading the code:** only on
`migration/phase4-frontend-repoint` (step 2d) — the three read-only Server Components (via
`lib/python-api.ts`) and the Studio editor's two write calls (`components/authoring/studio-editor.tsx`,
via `lib/studio-client.ts`'s `studioApiFetch`). `studioApiFetch` is "hybrid by
configuration": with `NEXT_PUBLIC_PYTHON_API_BASE_URL` unset it falls back to the
same-origin Next.js route — so the editor's requests still land on the TypeScript handler
today, by default, confirmed by reading `studioApiFetch`'s empty-string fallback. No branch,
including step 2d, repoints the login or reset-password forms; all still call
`/api/auth/*` same-origin.

**One more confirmed duplication, found while reading the login route for this audit, not
previously called out:** the in-memory rate limiter (`MAX_ATTEMPTS`, `WINDOW_MS`, keyed by
client IP since the `fix/login-rate-limit-by-ip` hotfix) lives in
`app/api/auth/login/route.ts`. `backend/api/app.py` has its own `rate_limited()`/`client_key()`
pair implementing the same check independently in Python. Repointing the route to Python
without removing the TypeScript limiter would stack two independent rate limiters rather
than replacing one with the other — tracked explicitly so the next step doesn't leave it
behind as a new, undetected duplication.

**Decision:** repoint the six write routes and the login/reset forms to Python the same way
the read path was done in step 2d — a thin Node-side proxy (`lib/python-api.ts` gains a
POST-capable sibling of `pythonApiGet`) forwarding the request and session cookie, removing
the route's own business logic (including the now-redundant TypeScript rate limiter) as
part of the same change, not after. A platform-level rewrite (Vercel Services routing
`/api/studio/*` and `/api/auth/*` to Python directly, bypassing Next.js's own routing
entirely) is deferred to Phase 6: it needs a stable deployed Python URL this migration
doesn't have yet, and once it exists, the thin proxies built now have no business logic
left to migrate — only the routing itself would change.

## Phase 4 — Authoring and auth

Step 1: write characterization tests against the real, current behavior of the six
`app/api/studio/**` / `app/api/auth/**` routes and `middleware.ts` — none exist today. Lock
their actual request/response shapes, status codes, and cookie behavior before changing
anything, the same discipline this migration has used at every prior phase.

Step 2: port `authoring/` (repository, workflow, `MDXRenderer`) and `auth/` (passwords —
remember the salt-as-literal-hex-string trap confirmed in the Phase 4 audit above —
sessions, Supabase calls) to Python behind FastAPI routes matching today's shapes, plus a
new `GET /api/authoring/definitions` endpoint replacing `kernel/authoring.ts` (decided
above). `components/authoring/`'s form-submission code needs minimal changes beyond its
base URL; the Studio's Server Components (`app/studio/(protected)/**/page.tsx`), which
read `authoring/server.ts` in-process today, need to be rewritten to call the new API
instead — scope this explicitly, it's not covered by "repoint the forms." `middleware.ts`
is not touched (decided above) — Python just needs to write session rows Supabase in the
same shape it reads today.

Step 3: implement publish-via-GitHub-API (decided above): the Python service commits the
rendered MDX to `main` through GitHub's REST API instead of `writeFile`/`unlink` to a local
`content/`, and calls a new, secret-protected Next.js route whose only job is
`revalidatePath` — Python cannot call that itself. Surface publication as asynchronous in
both the Studio UI and (later, Phase 5) the MCP `publish` tool, since it now completes on a
Vercel redeploy, not synchronously.

Delete the old Next.js API routes and `kernel/authoring.ts` once the Studio UI is repointed
and the Step 1 characterization tests pass unchanged against the new backend.

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

## Phase 7 — Cutover and TypeScript cleanup

This formalizes a question raised directly (2026-10-22): deletion of the old TypeScript
implementation does not happen all at once, and does not happen on a calendar date — it
happens per area, each gated on its own proof, in keeping with this migration's practice
throughout (prove parity, flip the default, confirm nothing still depends on the old path,
only then delete). Nothing below is to be treated as done until its own checklist is
satisfied; this phase exists so "can we delete X yet" always has a written, checkable
answer instead of an estimate.

**Per-area gating. Four independent areas, each with its own checklist — a later area
cannot be removed before an earlier one it depends on:**

1. **`build/`'s TypeScript producer** (`build/targets/duckdb-target.ts`,
   `build/targets/manifest-target.ts`, `build/duckdb/connect.ts`, `build/cli.ts`'s
   TypeScript path): removable once (a) `content/` has real content and the Phase 3.5
   parity script has validated the Python producer against it, not just synthetic fixtures
   and an empty tree; (b) the DuckDB-version-skew CI job has actually run green on the
   Linux/Python 3.12/Node 20.9 matrix this project targets, not only locally on Windows;
   (c) `vercel.json`'s `buildCommand` default has been flipped to
   `STORIES_BUILD_PRODUCER=python`; (d) it has run as the production default for an
   observation period with no incident, not merely passed its own tests on day one.
2. **`kernel/`** (schemas, parsing, validation, normalization, relationships, graph):
   removable only once nothing in production still imports it. As of this writing that's
   still everything — the live Studio, the default build path, `app/studio/**`'s pages. Its
   removal is gated on both area 1 above and all of area 3 below being complete.
3. **`authoring/`, `auth/`, `app/api/studio/**`, `app/api/auth/**`, `kernel/authoring.ts`**:
   removable once Phase 4 is entirely done — the Python auth core (in progress), the
   GitHub-API publish path with its `revalidatePath` callback (not started), and the
   Studio's Server Components rewritten to call the new Python API instead of importing
   `authoring/server.ts` in-process (not started, and a hard blocker — deleting these files
   before that rewrite ships breaks the Studio outright) — plus, at least once, a real
   validation pass against an actual Supabase project. Every test in this migration so far,
   across every phase, has run against an in-memory fake; none of it has touched real
   Supabase, by design and explicitly flagged each time. Deleting the TypeScript fallback
   before that gap is closed at least once would mean cutting over to Python with zero
   evidence it works against the real database.
4. **`middleware.ts`**: never removed. Decided above — it keeps reading Supabase directly,
   regardless of how far the rest of this migration progresses.

**Before deleting any file in a cleared area**, confirm with the same method already used
twice in this migration (the rate-limiter dependency check, the `file_path` cross-codebase
grep): grep the whole tracked tree for every import of the file being removed, across
`app/`, `components/`, `lib/`, and any remaining TypeScript, and treat a single unexpected
hit as a reason to stop, not a reason to special-case around it.

**Bake-in, not a hard rule but a strong recommendation given this ADR's own caveats**
(Vercel Services is Beta; LadybugDB is a young fork; nothing has run against real Supabase
yet): let each area run as the production default for a deliberate observation window
before deleting its TypeScript equivalent, long enough to see a real publish, a real login,
and a real build cycle succeed in production — not just in characterization tests. Exactly
how long is a judgment call once the service is actually live; this ADR does not fix a
number, because guessing one now would be less honest than deciding it with real traffic
in front of you.

**What's explicitly NOT a gate**: the Python code existing, the Python code's own tests
passing, or a phase report saying something is "done" — every phase so far has needed
independent verification before being trusted, and cutover decisions deserve at least that
much scrutiny, not less.
