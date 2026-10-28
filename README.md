# Stories

Stories is the operating system of a research laboratory — not a blog, not a CMS.

It organizes Research Programs, Scientific Questions, Hypotheses, Experiments, Knowledge
Objects, Software, Publications, and Datasets through a canonical Knowledge Model. Publishing
generates readable MDX, DuckDB, and manifest artifacts. See `docs/adr/ADR-002.md`.

The public site is a statically generated Next.js application. The private Knowledge Authoring
Studio is backed by a **Python service** (`backend/`, FastAPI) that owns authentication, drafts,
validation, MDX rendering, publication and the knowledge build. See `docs/adr/ADR-004-*.md`.

## Philosophy

- **Knowledge Objects are the source of truth.** Studio drafts live in Supabase; publishing
  generates deterministic MDX under `content/`, committed to Git.
- **DuckDB is a generated index**, not a store. It is safe to delete
  `database/generated/*.duckdb` at any time and rebuild it with `pnpm build:knowledge`.
- **The public site needs no live backend.** Next.js reads only the generated snapshot; the
  Python service is needed to author, not to serve pages.
- **Domain-Driven Design, narrowly applied.** Business logic lives in `domain/*/service.ts`
  (TypeScript, public side) and in `backend/` (Python, authoring and build side), never in a
  React component.
- **Strong typing everywhere.** `any` is an ESLint error; the backend runs `mypy --strict`.

See `docs/architecture/Architecture.md` for the full picture.

## Project structure

```
app/            Next.js App Router routes (public site, /studio, /api relays)
components/     Presentational React, grouped by surface (ui, layout, knowledge, authoring, shared)
backend/        Python service (FastAPI): API, auth, authoring, kernel, build pipeline, MCP server
authoring/      TypeScript authoring types and renderers (Studio UI still imports them)
auth/           TypeScript session check used by middleware.ts and the Studio layouts
content/        Generated, Git-versioned MDX publications
knowledge/      Legacy location of Studio drafts (drafts now live in Supabase)
database/       Output of the knowledge build (database/generated/)
supabase/       SQL migrations for the persistence table
docs/           Architecture notes, ADRs, operations, roadmap
kernel/ runtime/ build/   TypeScript Kernel, Platform Runtime and build pipeline (see below)
lib/            Infrastructure: markdown parsing, DuckDB client, search, Python API client
schemas/        Shared Zod primitives every content type extends
domain/         One module per entity: types, schema, service, README
public/         Static assets
scripts/        Operational scripts
styles/         Global CSS (Tailwind v4)
render.yaml     Render Blueprint for the Python service
vercel.json     Vercel install and build commands
```

The TypeScript `kernel/`, `authoring/`, `auth/` and `build/` code is being retired area by area
as the Python backend proves parity (ADR-004, Phase 7). The default production build already
uses the Python producer.

## Local development

Requires Node ≥ 20.9, [pnpm](https://pnpm.io) ≥ 9, and — for the Studio and the production
build path — Python 3.12 with [uv](https://docs.astral.sh/uv/).

```bash
pnpm install
cp .env.example .env.local
pnpm build:knowledge
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Public pages do not need the Python service.

### Studio (needs the Python service)

The Studio at [http://localhost:3000/studio](http://localhost:3000/studio) talks to the Python
API, so run it beside Next.js:

```bash
cd backend && uv sync && uv run uvicorn main:app --port 8000   # terminal 1
pnpm dev                                                        # terminal 2
```

`.env.local` and the Python service both need the `SUPABASE_*` values; see `.env.example` and
`docs/operations/DEVELOPER-WORKFLOW.md` for the full variable list. The admin account is created
once with `pnpm studio:auth:init`.

### Scripts

```bash
pnpm build           # production build
pnpm start           # run the production build
pnpm lint            # ESLint
pnpm lint:fix        # ESLint with autofix
pnpm format          # Prettier, write
pnpm format:check    # Prettier, check only
pnpm typecheck       # tsc --noEmit
pnpm test            # vitest
pnpm build:knowledge # generate DuckDB and manifest (STORIES_BUILD_PRODUCER=python for the Python producer)
pnpm build:knowledge:parity # build real content with both producers and diff the artifacts
pnpm release:verify  # knowledge build, typecheck, lint, test, build
```

Backend, from `backend/`:

```bash
uv run pytest        # Python tests
uv run ruff check .  # lint
uv run mypy          # strict type check
```

Husky runs `lint-staged` on every commit (ESLint + Prettier on staged files) — installed
automatically by the `prepare` script on `pnpm install`.

## Build process

`pnpm build:knowledge` generates and validates `manifest.json` and `knowledge.duckdb`. With
`STORIES_BUILD_PRODUCER=python` (set in `vercel.json`) the Python pipeline in `backend/pipeline`
produces them; unset, the TypeScript pipeline does. `pnpm build` then statically renders the
public laboratory from those artifacts through the Platform Runtime. The website never rebuilds
knowledge automatically.

For a production candidate, run `pnpm release:verify`. Deployment, authoring, maintenance,
and release procedures are documented under `docs/operations/` and `docs/release/`.

## Publishing

In the Studio, **Publish** validates the draft, renders MDX, and makes one commit to the
configured GitHub branch through the Python API. Vercel builds that commit and deploys it. The
same workflow is available to Claude through the local MCP server in `backend/mcp_server/`
(read its trust model before enabling it).

## Deployment

Two deployables:

- **Next.js** on [Vercel](https://vercel.com). `vercel.json` installs uv and the backend
  dependencies, then runs the Python knowledge build before `pnpm build`.
- **Python API** on any long-lived ASGI host. `render.yaml` is a ready Render Blueprint.

The browser only ever calls Next.js; Next.js relays Studio calls to the Python API server-side
through `PYTHON_API_BASE_URL`. Never set `NEXT_PUBLIC_PYTHON_API_BASE_URL` in production. See
`docs/operations/DEPLOYMENT.md`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

- `verify`: knowledge build, typecheck, lint, test, build.
- `python-artifact`: backend pytest, Python-writes/Node-reads round trip, TypeScript-vs-Python
  artifact parity, real-content parity, `ruff`, and `mypy --strict`.

Vercel handles deployment itself once the repo is connected there.
