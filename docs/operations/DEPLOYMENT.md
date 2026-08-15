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

Vercel's zero-config Next.js detection only runs `pnpm build` — it has no way to know
`build:knowledge` must run first, and a deploy relying on that default fails with a missing
manifest. `vercel.json` at the repo root overrides both `installCommand` and `buildCommand`
to the sequence above, so a Vercel project linked to this repo needs no manual dashboard
configuration.

The host must support the native DuckDB package during build. The deployed server does
not need a writable database. Preserve the Node and pnpm versions declared in
`package.json`.

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
