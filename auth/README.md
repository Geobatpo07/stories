# auth/ — Studio authentication

Protects the private Knowledge Authoring Studio (`app/studio/**`, `app/api/studio/**`) with
a single admin account: login, session validation, logout, and a password-reset-by-email
flow. Mirrors `authoring/`'s shape — a thin, framework-free module plus a `server.ts` that
wires real adapters, imported directly by `app/`, never through the public barrel.

## Why single-admin, not multi-user

This is a private research notebook (ADR-001: "single-author"), not a SaaS product. There
is exactly one credential record (`auth/repository.ts`'s `CredentialRepository`, fixed id
`"admin"`), no signup flow, and no roles/permissions model. The admin account is bootstrapped
by `scripts/setup-studio-auth.ts`, run once by the operator, never by a public form.

## Zero new dependencies

- **Password hashing**: `node:crypto`'s `scrypt` + `timingSafeEqual` (`auth/passwords.ts`).
- **Sessions**: an opaque random token (`generateToken()`, 256 bits from `randomBytes`),
  looked up server-side against a stored record — not a JWT, so nothing needs a signature
  library. Revoking a session is just deleting its record.
- **Password-reset email**: `runtime/adapters/resend-email-adapter.ts` calls Resend's HTTP
  API directly with `fetch` — not the `resend` npm package, which is a thin wrapper over the
  same one JSON POST. Requires `RESEND_API_KEY` (and `STUDIO_ADMIN_RESET_FROM_EMAIL`) in
  `.env.local`; the operator provisions their own Resend account.
- **Storage**: `runtime/adapters/supabase-persistence-adapter.ts` calls Supabase's PostgREST
  HTTP API directly with `fetch` — not the `@supabase/supabase-js` SDK, same reasoning as
  Resend above (see that file's doc comment; it also keeps the adapter usable from
  `middleware.ts` on the standard Edge runtime, which the SDK doesn't guarantee).

## Storage: Supabase, never `knowledge/`

`knowledge/README.md` states canonical Knowledge Objects "should be committed" — that
directory is Git-tracked by design (ADR-002). Credentials, sessions, and reset tokens must
never land in Git history, and — separately — Vercel's serverless functions can't write to
a local filesystem at all outside `/tmp` (ephemeral, never shared across invocations). Both
rule out `FileSystemPersistenceAdapter` for this data. `auth/server.ts` instead points
`SupabasePersistenceAdapter` at `namespace: "auth"` in one shared table,
`persistence_records` (`supabase/migrations/0001_persistence_records.sql` — run manually in
your Supabase project's SQL Editor; nothing in this repo has direct access to apply it for
you). `authoring/server.ts` uses the same table under `namespace: "knowledge"` for Studio
drafts, sharing the schema without the two ever colliding. Three collections under `"auth"`:

- `auth` / id `"admin"` — the one `AdminCredential` record.
- `auth-sessions` / id = session token — `{ token, createdAt, expiresAt }`. The token is
  duplicated onto the value itself because `PersistencePort.list()` returns values, not
  ids — `SessionRepository.destroyAll()` (called after a password reset, to sign out every
  device) needs the token back to issue the matching `delete()` calls.
- `auth-reset-tokens` / id = reset token — single-use: `ResetTokenRepository.consume()`
  deletes the record the moment it's read, valid or not.

`SupabasePersistenceAdapter` never validates its `url`/`serviceRoleKey` constructor
arguments and never throws at construction (see its doc comment) — both `auth/server.ts`
and `authoring/server.ts` build one at module scope, which every `/studio/**` page imports,
including ones that must still 404 cleanly via `isStudioEnabled()` when the Studio feature
itself is off or Supabase isn't configured yet. It fails lazily, only on an actual request,
the same deliberate choice `ResendEmailAdapter` already makes.

`runtime/adapters/file-system-persistence-adapter.ts` is unused in `server.ts` wiring now
but still exercised directly in tests (`auth/workflow.test.ts`,
`authoring/workflow.test.ts`) — fast, deterministic, no network, and those tests only care
about `PersistencePort`'s contract, never the concrete adapter.

## `middleware.ts` is load-bearing, not a convenience layer

The first design here checked the session only in `app/studio/(protected)/layout.tsx`
(`redirect()` if absent) and in each `app/api/studio/**` route. That looked sufficient
until direct testing (`curl`, no cookie) showed otherwise: Next.js's App Router can start
rendering a protected page's data-fetching concurrently with its parent layout as part of
one streamed response. `redirect()` thrown from the layout did not stop
`app/studio/(protected)/page.tsx` from already having fetched and streamed the real
knowledge-document list into that same response before the redirect — a browser wouldn't
render it (a `<meta http-equiv="refresh">` tag sent it away within a second), but the
private data was already on the wire, readable by anything that isn't a browser.

`middleware.ts` at the repo root closes that gap by blocking `/studio/:path*` and
`/api/studio/:path*` (except `/studio/login` and `/studio/reset-password`) before any
Server Component or Route Handler runs at all — no partial render, nothing to leak. It runs
on the **standard Edge runtime** — no special config needed, now that the session store is
a `fetch` call to Supabase instead of `node:fs`. (An earlier version required the
experimental Node.js Middleware runtime — `runtime: "nodejs"` plus an
`experimental.nodeMiddleware` flag in `next.config.ts` — purely because
`FileSystemPersistenceAdapter` needed `node:fs`; that requirement, and the flag, are gone
along with it.) It imports `SupabasePersistenceAdapter` and `SessionRepository` from their
own files — `@/runtime/adapters/supabase-persistence-adapter`, `@/auth/repository` —
rather than the `@/runtime`/`@/auth` barrels, because the `@/runtime` barrel also
re-exports `ArtifactKnowledgeSourceAdapter`, which imports the `@duckdb/node-api` native
binding at module scope; a session check has no reason to pull that into the Middleware
bundle (and Edge couldn't run it if it were pulled in). It also reads
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` directly from `process.env` rather than through
`EnvironmentConfiguration` — see `middleware.ts`'s own doc comment for why.

The layout-level `getStudioSession()` check and each `app/api/studio/**` route's own check
stay in place as defense-in-depth (matching how `isStudioEnabled()` is already checked at
multiple layers) — normally redundant once Middleware has already gated the request, cheap
to keep.

## Route structure

`app/studio/(protected)/` is a Next.js route group — it changes no URL, only adds a second
layout (`app/studio/(protected)/layout.tsx`) that redirects to `/studio/login` when
`getStudioSession()` is false, as a second layer behind Middleware. `app/studio/login/`
and `app/studio/reset-password/` sit outside that group so they stay reachable without a
session, but remain inside `app/studio/` so the existing `isStudioEnabled()` check in
`app/studio/layout.tsx` still 404s the whole feature (login page included) when the
Studio itself is disabled.

## What's deliberately not built

- **Multi-user / roles.** One admin, by design — see above.
- **Persistent rate limiting.** Login attempts are throttled with an in-memory counter
  (`app/api/auth/login/route.ts`) that resets on server restart — acceptable for a
  single-admin tool; a `PersistencePort`-backed limiter is the natural extension if this
  Studio is ever exposed more broadly.
- **CSRF tokens.** The session cookie is `sameSite: "lax"`, which already blocks
  cross-site form/script submission from third-party origins for the state-changing
  requests this app makes (POST via `fetch`, same-site only).

## Testing

Co-located `*.test.ts`, same convention as `authoring/`. `passwords.test.ts` covers the
hash/verify round trip; `workflow.test.ts` exercises `AuthWorkflow` against in-memory
`PersistencePort`/`EmailPort`/`ClockPort` fakes, the same style
`authoring/workflow.test.ts` already uses for `@/build`.
