# Developer workflow

## Requirements

- Node.js 20.9 or newer
- pnpm 9 or newer (the repository pins pnpm 10.15.1)
- A platform supported by `@duckdb/node-api`

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SITE_URL` to the public origin.
`DUCKDB_PATH` may remain at its default for local work.

## Daily workflow

```bash
pnpm install
pnpm build:knowledge
pnpm dev
```

The knowledge build must succeed before the website starts. Presentation code never
falls back to source content and never repairs an invalid artifact automatically.

Before review:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Use `pnpm release:verify` for the complete release sequence, including artifact rebuild.

### Working on the Studio (needs the Python service)

The Studio pages read documents and field definitions from the Python API, so Studio work needs
two processes side by side:

```bash
# terminal 1 — Python API, port 8000 (from the repository root)
cd backend && uv sync && uv run uvicorn main:app --port 8000

# terminal 2 — Next.js, port 3000
pnpm dev
```

Set `PYTHON_API_BASE_URL`, `NEXT_PUBLIC_PYTHON_API_BASE_URL` and `STORIES_STUDIO_ENABLED=true` in
`.env.local`, and `STUDIO_ALLOWED_ORIGINS=http://localhost:3000` in the environment of the Python
service (see `.env.example`; both services also need the same `SUPABASE_*` values). Session
validation (`middleware.ts`, `auth/server.ts`) still reads Supabase directly from Next.js. If the
Python service is down, Studio pages show the app error page (`app/error.tsx`), not an empty list.
Public pages do not need the Python service.

The Studio write routes (`/api/studio/documents` POST, `.../publish`, `/api/auth/*`) are pure relays to
the Python API: `PYTHON_API_BASE_URL` is required in every environment that serves them, including
production (unset: 503, unreachable: 502; there is no TypeScript fallback any more). The login
limiter keys on `x-real-ip`, which the relay forwards, so set `VERCEL=1` on the Python service as
well when it sits behind Vercel.

## Presentation boundaries

- `app/` composes Runtime data and components.
- `lib/presentation/` contains server projections and pure display calculations.
- `components/` renders typed props; client components own interaction only.
- `runtime/` is the sole application gateway to generated knowledge.
- Never import `content/`, `lib/markdown`, `lib/duckdb`, `build/`, or Kernel internals from
  a page or component.

Search, filtering, themes, reading progress, code copying, and figure zoom are small
client interactions. The searchable records and story directory records are minimized
server projections; raw file paths and implementation metadata are not serialized.

## Maintenance

Update dependencies deliberately and run the release sequence after each batch. Keep
`react-markdown`, Remark/Rehype plugins, and KaTeX on mutually compatible major versions.
Review native DuckDB support before changing Node versions or deployment platforms.

If the client search projection becomes materially large, use the existing Runtime
`SearchPort`; do not add a second knowledge store from a component.
