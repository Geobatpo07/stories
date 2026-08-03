# Architecture

Stories is the operating system of a research laboratory, not a blog and not a CMS. This
document describes the shape of the foundation laid in the first sprint — no business
features are implemented yet; see docs/roadmap for what comes next.

## Layers

```
content/     → the source of truth (MDX + frontmatter), one folder per collection
schemas/     → shared Zod primitives every content type's frontmatter extends
domain/      → one module per entity: types.ts, schema.ts, service.ts, index.ts, README.md
lib/         → infrastructure: markdown parsing, DuckDB client, search, metadata, utils
database/    → the generated analytical index (DuckDB) and the script that builds it
components/  → presentational React, grouped by surface (research, knowledge, layout, shared, ui)
app/         → Next.js App Router routes — composes domain services and components
```

Dependencies point one direction: `app/` and `components/` depend on `domain/`; `domain/`
depends on `lib/` and `schemas/`; `lib/` and `schemas/` depend on nothing above them. A
domain module never imports from `components/` or `app/`.

## Domain-Driven Design, applied narrowly

Each entity — Research Program, Scientific Question, Hypothesis, Experiment, Knowledge
Object, Publication, Software, Dataset — is a module under `domain/` with:

- `types.ts` — the TypeScript shape, largely inferred from `schema.ts`.
- `schema.ts` — the Zod schema validating that entity's frontmatter, extending the shared
  `baseFrontmatterSchema` from `schemas/`.
- `service.ts` — where business logic will live (listing, filtering, cross-referencing).
  **Empty in this sprint by design.**
- `README.md` — the module's purpose and open extension points, kept next to the code it
  describes rather than in a separate wiki that will drift.
- `index.ts` — the module's public surface; nothing outside the module reaches into its
  internals directly.

"No feature coupling" means `domain/experiment` does not import from `domain/software`
even though an experiment will eventually reference software — it references it by typed
slug (`hypothesisSlug`, `questionSlug`, …), the same pattern used throughout. Resolving a
slug into the full entity is a service-layer concern for later, not a compile-time import.

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

- **Where does a Hypothesis live?** `domain/hypothesis` exists, but `content/` has no
  `hypotheses/` collection — see `domain/hypothesis/README.md`. Resolve this before the
  first real hypothesis is written, not after several exist in the wrong shape.
- **MDX rendering strategy.** This sprint reads MDX as raw text (`lib/markdown`) and
  validates frontmatter; it does not compile MDX to React. `next-mdx-remote` and `@next/
  mdx` are both reasonable choices and neither is installed yet — decide once the first
  route actually needs to render a note's body.
- **DuckDB schema design.** `database/build-index.ts` intentionally creates no tables.
  Table shape should follow from real query patterns (search? tag filters? cross-program
  timelines?) rather than being guessed at before any UI needs them.
