# Stories

Stories is the operating system of a research laboratory — not a blog, not a CMS.

It organizes Research Programs, Scientific Questions, Hypotheses, Experiments, Knowledge
Objects, Software, Publications, and Datasets as Markdown/MDX, and generates a DuckDB
index on top for fast querying. See `docs/adr/ADR-001.md` for why.

**This repository currently contains foundations only** — configuration, domain
modeling, content schemas, and an empty analytical index. No research surfaces are
implemented yet. See `docs/roadmap/ROADMAP.md`.

## Philosophy

- **MDX is the single source of truth.** Every fact lives in a versioned text file under
  `content/`. Nothing is only in the database.
- **DuckDB is a generated index**, not a store. It is safe to delete
  `database/generated/*.duckdb` at any time and rebuild it with `pnpm db:index`.
- **Domain-Driven Design, narrowly applied.** Business logic lives in `domain/*/service.ts`,
  never in a React component. Components render typed data; they do not fetch or decide.
- **Strong typing everywhere.** `any` is an ESLint error, not a convention.

See `docs/architecture/Architecture.md` for the full picture.

## Project structure

```
app/            Next.js App Router routes
components/     Presentational React, grouped by surface (ui, layout, research, knowledge, shared)
content/        MDX source of truth — one folder per collection
database/       The generated DuckDB index and the script that builds it
docs/           Architecture notes, ADRs, roadmap
lib/            Infrastructure: markdown parsing, DuckDB client, search, metadata, utils
schemas/        Shared Zod primitives every content type extends
domain/         One module per entity: types, schema, service, README
packages/       Reserved for future extracted shared packages
public/         Static assets
scripts/        Operational scripts (content validation, generators)
styles/         Global CSS (Tailwind v4)
types/          Ambient/global TypeScript declarations
```

## Local development

Requires Node ≥ 20.9 and [pnpm](https://pnpm.io) ≥ 9.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other scripts

```bash
pnpm build          # production build
pnpm start          # run the production build
pnpm lint           # ESLint
pnpm lint:fix        # ESLint with autofix
pnpm format         # Prettier, write
pnpm format:check   # Prettier, check only
pnpm typecheck       # tsc --noEmit
pnpm db:index        # prepare the DuckDB analytical index
```

Husky runs `lint-staged` on every commit (ESLint + Prettier on staged files) — installed
automatically by the `prepare` script on `pnpm install`.

## Build process

`pnpm build` runs a standard Next.js production build. `pnpm db:index` is a separate,
explicit step — it is not run automatically on build yet, since it does not do anything
beyond opening the database file at this stage. Once indexing logic exists, wiring it
into the build pipeline (`prebuild`, or a Vercel Build Output step) is a roadmap item, not
a foundation-sprint concern.

## Deployment

Targets [Vercel](https://vercel.com). No project-specific Vercel configuration exists yet
— default Next.js detection is sufficient at this stage.
