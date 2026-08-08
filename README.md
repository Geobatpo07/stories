# Stories

Stories is the operating system of a research laboratory — not a blog, not a CMS.

It organizes Research Programs, Scientific Questions, Hypotheses, Experiments, Knowledge
Objects, Software, Publications, and Datasets through a canonical Knowledge Model. Publishing
generates readable MDX, DuckDB, and manifest artifacts. See `docs/adr/ADR-002.md`.

Version 3 adds a private Knowledge Authoring Studio to the complete public Digital Research
Laboratory. Programs, Projects, Stories, and Artifacts are authored as canonical Knowledge
Objects and statically presented from the Platform Runtime's verified generated snapshot.

## Philosophy

- **Knowledge Objects are the source of truth.** Private drafts live under `knowledge/`;
  publishing generates deterministic MDX under `content/`.
- **DuckDB is a generated index**, not a store. It is safe to delete
  `database/generated/*.duckdb` at any time and rebuild it with `pnpm build:knowledge`.
- **Domain-Driven Design, narrowly applied.** Business logic lives in `domain/*/service.ts`,
  never in a React component. Components render typed data; they do not fetch or decide.
- **Strong typing everywhere.** `any` is an ESLint error, not a convention.

See `docs/architecture/Architecture.md` for the full picture.

## Project structure

```
app/            Next.js App Router routes
components/     Presentational React, grouped by surface (ui, layout, research, knowledge, shared)
authoring/      Knowledge Object lifecycle, repository, and publication renderers
content/        Generated, Git-versioned MDX publications
knowledge/      Canonical Knowledge Objects created by Studio autosave
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

Open [http://localhost:3000/studio](http://localhost:3000/studio) to create, autosave,
validate, preview, and publish knowledge without manually creating MDX files.

### Other scripts

```bash
pnpm build          # production build
pnpm start          # run the production build
pnpm lint           # ESLint
pnpm lint:fix        # ESLint with autofix
pnpm format         # Prettier, write
pnpm format:check   # Prettier, check only
pnpm typecheck       # tsc --noEmit
pnpm build:knowledge # generate DuckDB and manifest publication artifacts
```

Husky runs `lint-staged` on every commit (ESLint + Prettier on staged files) — installed
automatically by the `prepare` script on `pnpm install`.

## Build process

`pnpm build:knowledge` generates and validates `manifest.json` and `knowledge.duckdb`.
`pnpm build` then statically renders the public laboratory from those artifacts through
the Platform Runtime. The website never rebuilds knowledge automatically.

For a production candidate, run `pnpm release:verify`. Deployment, authoring, maintenance,
and release procedures are documented under `docs/operations/` and `docs/release/`.

## Deployment

Targets [Vercel](https://vercel.com). No project-specific Vercel configuration exists yet
— default Next.js detection is sufficient at this stage.
