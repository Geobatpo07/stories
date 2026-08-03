# Architecture

Stories is the operating system of a research laboratory, not a blog and not a CMS. This
document describes the shape of the foundation laid in the first sprint, the Knowledge
Kernel added in the second, and the Platform Runtime added in the third — see
docs/roadmap for what comes next.

## Layers

```
content/     → the source of truth (MDX + frontmatter), one folder per collection
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
               business logic. Not yet wired into app/ — ships standalone. See
               runtime/README.md.
domain/      → one module per entity: types.ts, schema.ts, service.ts, index.ts, README.md
lib/         → infrastructure: markdown parsing, DuckDB client, search, metadata, utils
database/    → the generated analytical index (DuckDB) and the script that builds it
components/  → presentational React, grouped by surface (research, knowledge, layout, shared, ui)
app/         → Next.js App Router routes — composes domain services and components
```

Dependencies point one direction, at file granularity: `app/` and `components/` depend on
`domain/*/service.ts`; `domain/*/service.ts` depends on `@/kernel` (the Kernel's public
barrel) and nothing else in the Kernel; `kernel/` depends on `domain/*/schema.ts` (never
a domain module's `types.ts` or `service.ts` or its barrel `index.ts`) plus `schemas/`;
`schemas/` and `domain/*/schema.ts` depend on nothing above them. `runtime/` depends only
on `@/kernel` (never `domain/*`, `app/`, `components/`, `lib/duckdb`, `lib/search`,
`lib/metadata`) — a second, independent consumer of the Kernel's public barrel, alongside
`domain/*/service.ts`. The full graph: `schemas/ → domain/*/schema.ts → kernel/ →
{domain/*/service.ts, runtime/}`.

The Kernel is the one place business logic (listing, filtering, cross-referencing,
relationship resolution) actually lives — `domain/*/service.ts` is a thin wrapper over
it, and `runtime/` orchestrates around it without adding any of its own. A domain module
never imports from `components/` or `app/`. See kernel/README.md, "Dependency direction,"
for why this isn't a cycle even though the Kernel reuses the domain's schemas and the
domain consumes the Kernel.

Note the brief's own conceptual stack for the Runtime (`Adapters → Platform Runtime →
Knowledge Kernel → Knowledge Graph → Applications`) describes _runtime data flow_ — the
Runtime orchestrates calls into the Kernel at boot. That's a different axis from the
_file import direction_ above (`runtime/ → @/kernel`); both are simultaneously true. See
runtime/README.md for the full explanation.

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

## MDX as the source of truth, DuckDB as a generated index

See docs/adr/ADR-001.md for the full reasoning. In short: every fact about the lab's
research lives in a file under `content/`, in plain text, versioned in Git. DuckDB never
holds information that doesn't also exist in a content file — it exists purely so the
site can query across hundreds of notes fast (search, tag filters, cross-references)
without re-parsing MDX on every request. Delete `database/generated/*.duckdb` at any time
and rebuilding from `content/` should reproduce it exactly.

## Open questions

- **MDX rendering strategy.** This sprint reads MDX as raw text (`lib/markdown`) and
  validates frontmatter; it does not compile MDX to React. `next-mdx-remote` and `@next/
mdx` are both reasonable choices and neither is installed yet — decide once the first
  route actually needs to render a note's body.
- **DuckDB schema design.** `database/build-index.ts` intentionally creates no tables.
  Table shape should follow from real query patterns (search? tag filters? cross-program
  timelines?) rather than being guessed at before any UI needs them.
