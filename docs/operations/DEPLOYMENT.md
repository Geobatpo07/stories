# Production deployment

Stories is built as a statically generated Next.js application. DuckDB is required while
building pages but not for ordinary page requests after a successful production build.

## Required configuration

```text
NEXT_PUBLIC_SITE_URL=https://<canonical-production-origin>
DUCKDB_PATH=./database/generated/knowledge.duckdb
```

`NEXT_PUBLIC_SITE_URL` must be the canonical HTTPS origin with no trailing slash. It is
used by canonical metadata, Open Graph, structured breadcrumbs, RSS, sitemap, and robots.

## Build command

```bash
pnpm install --frozen-lockfile
pnpm build:knowledge
pnpm build
```

Both commands must run in the same workspace. Generated knowledge is intentionally not
committed; the pipeline creates it before Next.js collects and statically renders pages.
Do not deploy a previous `.next` directory with a newly generated manifest.

`build:knowledge` uses the TypeScript producer unless `STORIES_BUILD_PRODUCER=python` is set;
`vercel.json` sets it, so production runs the Python producer (Phase 7 cutover; see
`build/README.md`) and its `installCommand` installs uv and runs `uv sync --frozen` in `backend/`.

Vercel's zero-config Next.js detection only runs `pnpm build` — it has no way to know
`build:knowledge` must run first, and a deploy relying on that default fails with a missing
manifest. `vercel.json` at the repo root overrides both `installCommand` and `buildCommand`
to the sequence above, so a Vercel project linked to this repo needs no manual dashboard
configuration.

The host must support the native DuckDB package during build. The deployed server does
not need a writable database. Preserve the Node and pnpm versions declared in
`package.json`.

## Publishing from the Studio (Python API)

The Python Studio API (`backend/`, ADR-004 phase 4) publishes by committing to GitHub, because the
deployed filesystem is read-only. It first fetches the branch head, builds the content tree with
the change applied using the real build pipeline, and only then creates one tree, one commit and
one fast-forward ref update (a slug change writes the new file and deletes the old one in that same
commit). Vercel builds the commit on its own; the API reports it as `deployment: pending` and does
not yet follow or revert that deployment.

Environment (Python service): `GITHUB_PUBLISH_TOKEN` (fine-grained token, this repository only,
"Contents: Read and write"), `GITHUB_REPOSITORY`, optional `GITHUB_PUBLISH_BRANCH` (default
`main`), and `REVALIDATE_SECRET`. Environment (Next.js app): `REVALIDATE_SECRET`, the same value;
`app/api/internal/revalidate` rejects every call without it (503 when it is unset). A person must
create the token and the secret; if `main` is protected, the token's owner must be allowed to push.

## Failure behavior

Production generation stops when:

- the manifest is missing or malformed;
- the knowledge database checksum differs;
- manifest and database counts disagree;
- a graph relationship targets a missing entity;
- the native DuckDB module cannot load.

This fail-closed behavior prevents partially stale research from being published.

## Post-deployment checks

Verify `/`, `/laboratory`, one detail page of each public type, `/search`, `/rss.xml`,
`/sitemap.xml`, `/robots.txt`, the 404 response, keyboard search, theme persistence, and
print preview. Confirm canonical URLs use the production origin.

Rollback by redeploying the previous complete build output. Never copy only the database
or only the manifest between releases.
