# Architecture

Stories is the operating system of a research laboratory, not a blog and not a CMS. This
document describes the complete platform through Version 3: Foundation, Knowledge Kernel,
Platform Runtime, Knowledge Artifact Pipeline, public Presentation and Experience layers,
and the private Knowledge Authoring Studio.

## Layers

```
knowledge/   → canonical Knowledge Objects created and autosaved by the private Studio
authoring/   → model repository, publishing workflow, and renderer extension point
content/     → generated, Git-versioned MDX publications, one folder per collection
schemas/     → shared Zod primitives every content type's frontmatter extends
kernel/      → the Knowledge Kernel — owns the lifecycle, relationship resolution, the
               in-memory Knowledge Graph, and the one stable Public API. Framework-free:
               knows nothing about Next.js, React, databases, search, or AI. See
               kernel/README.md for the full lifecycle and dependency rules.
runtime/     → the Platform Runtime — composition root, dependency injection, lifecycle
               management, an in-memory event bus, and port interfaces (Persistence,
               Search, Export, Logging, Configuration, Clock, Identifier) for the
               collaborators a real platform needs. A second, independent consumer of
               @/kernel, sibling to domain/ — not a layer "below" it. Contains no
               business logic. Supplies generated knowledge to the Presentation Layer and
               persistence to the private Authoring Studio. See
               runtime/README.md.
build/       → the Knowledge Artifact Pipeline — compiles the Knowledge Graph into
               deterministic, disk-based artifacts (database/generated/knowledge.duckdb,
               manifest.json) via a registry of Build Targets. A third, independent
               consumer of @/kernel, sibling to domain/ and runtime/. Its generated output
               is consumed by the Runtime artifact adapter. See
               build/README.md.
domain/      → one module per entity: types.ts, schema.ts, service.ts, index.ts, README.md
lib/         → infrastructure: markdown parsing, DuckDB client, search, metadata, utils
database/    → output directory only (database/generated/) — the pipeline that builds
               its contents lives in build/, not here.
components/  → presentational React, grouped by surface (research, knowledge, layout, shared, ui)
app/         → Next.js App Router routes — composes domain services and components
```

Dependencies point one direction, at file granularity: `app/` and `components/` depend on
`domain/*/service.ts`; `domain/*/service.ts` depends on `@/kernel` (the Kernel's public
barrel) and nothing else in the Kernel; `kernel/` depends on `domain/*/schema.ts` (never
a domain module's `types.ts` or `service.ts` or its barrel `index.ts`) plus `schemas/`;
`schemas/` and `domain/*/schema.ts` depend on nothing above them. `runtime/` and `build/`
each depend only on `@/kernel` (never `domain/*`, `app/`, `components/`, `lib/search`,
`lib/metadata` — `build/` additionally uses `@duckdb/node-api` directly for its DuckDB
target, not `lib/duckdb`; see build/README.md) — two more independent consumers of the
Kernel's public barrel, alongside `domain/*/service.ts`. Neither depends on the other.
The full graph: `schemas/ → domain/*/schema.ts → kernel/ → {domain/*/service.ts,
runtime/, build/}`.

The Kernel is the one place business logic (listing, filtering, cross-referencing,
relationship resolution) actually lives — `domain/*/service.ts` is a thin wrapper over
it, and `runtime/`/`build/` each orchestrate around it without adding any of their own
(the Runtime executes the platform live; the Build Pipeline compiles it to disk — see
build/README.md's "Build philosophy" for why those stay separate responsibilities). A
domain module never imports from `components/` or `app/`. See kernel/README.md,
"Dependency direction," for why this isn't a cycle even though the Kernel reuses the
domain's schemas and the domain consumes the Kernel.

Note the brief's own conceptual stacks for the Runtime (`Adapters → Platform Runtime →
Knowledge Kernel → Knowledge Graph → Applications`) and the Build Pipeline (`Knowledge
Kernel → Knowledge Graph → Knowledge Artifact Pipeline → Build Targets → Generated
Artifacts → Platform Runtime → Applications`) describe _runtime/build-time data flow_ —
each orchestrates calls into the Kernel. That's a different axis from the _file import
direction_ above (`runtime/ → @/kernel`, `build/ → @/kernel`); both descriptions are
simultaneously true. See runtime/README.md and build/README.md for the full
explanations.

## Domain-Driven Design, applied narrowly

Each entity — Research Program, Scientific Question, Hypothesis, Experiment, Knowledge
Object, Publication, Software, Dataset, Presentation — is a module under `domain/` with:

- `types.ts` — the TypeScript shape, largely inferred from `schema.ts`.
- `schema.ts` — the Zod schema validating that entity's frontmatter, extending the shared
  `baseFrontmatterSchema` from `schemas/`.
- `service.ts` — a thin wrapper over the Knowledge Kernel's public API, scoped to that
  entity (e.g. `ProgramService.listAll()` calls `loadPrograms()`). The actual listing,
  filtering, and cross-referencing logic lives in `kernel/`, not here — see
  kernel/README.md.
- `README.md` — the module's purpose and open extension points, kept next to the code it
  describes rather than in a separate wiki that will drift.
- `index.ts` — the module's public surface; nothing outside the module reaches into its
  internals directly.

"No feature coupling" means `domain/experiment` does not import from `domain/software`
even though an experiment will eventually reference software — it references it by typed
slug (`hypothesisSlug`, `questionSlug`, …), the same pattern used throughout. Resolving a
slug into the full entity is the Knowledge Kernel's job (`kernel/pipeline/relationships.ts`),
never a compile-time import between domain modules.

## Why business logic stays out of components

`components/research` and `components/knowledge` render whatever typed data they're
given; they do not fetch, filter, or decide. That decision keeps presentational
components trivially testable in isolation and keeps the same domain service reusable
from a page, a script, or (later) an API route without duplicating logic in JSX.

## Knowledge Objects and generated publication artifacts

ADR-002 supersedes ADR-001. Canonical authoring state lives under `knowledge/`. Publishing
validates that model through the Kernel and generates readable MDX under `content/`. The
existing artifact pipeline then produces DuckDB and manifest snapshots for the Runtime.

The public website never reads canonical objects or MDX. It continues to consume only the
Platform Runtime. See `docs/architecture/AUTHORING-STUDIO.md` for the private authoring
boundary and transactional publication flow.
