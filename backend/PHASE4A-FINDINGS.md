# Phase 4, step 1: characterization tests (no Python)

Branch `migration/phase4-audit`, on top of `14b98fc`. Only tests, fixtures and test support were
added; no route, `middleware.ts`, `authoring/workflow.ts` or `auth/passwords.ts` change.
Raw output: `backend/evidence/phase-4a/`.

## Method

The real route handlers, `auth/server.ts`, `authoring/server.ts`, workflows, repositories and
`middleware.ts` run unmodified. Three module boundaries are faked (`app/api/test-support.ts`):
the Supabase adapter (in-memory `persistence_records`), the Resend adapter (records messages), and
`next/headers` (cookie jar backed by Next's real `ResponseCookies`, so the serialized Set-Cookie
text is Next's own). The publish tests run the real TypeScript build in a throwaway project root.

## Tests added: 138

| File                                                  | Tests |
| ----------------------------------------------------- | ----- |
| `app/api/auth/login/route.test.ts`                    | 24    |
| `app/api/auth/logout/route.test.ts`                   | 6     |
| `app/api/auth/reset-password/route.test.ts`           | 12    |
| `app/api/auth/reset-password/confirm/route.test.ts`   | 18    |
| `app/api/studio/documents/route.test.ts` (GET + POST) | 27    |
| `app/api/studio/documents/[id]/publish/route.test.ts` | 10    |
| `middleware.test.ts`                                  | 34    |
| `fixtures/auth-contract` (scrypt vectors)             | 3     |
| `fixtures/authoring-contract` (kernel/authoring.ts)   | 4     |

Suite before: 621 passed, 1 skipped. After: 759 passed, 1 skipped (+138).

## Behaviour nobody decided, now pinned

- Malformed JSON in any POST body is not caught: the handler throws (Next answers 500), not 400.
- Login: the 10-attempt limit is applied before the password check (the right password gets 429),
  is keyed by the submitted email (so anyone can lock the admin out for 15 min), and counts unknown emails.
- Logout clears the cookie with `Path=/` and an epoch expiry only (no HttpOnly/SameSite), and answers 200 with no or unknown cookie.
- The cookie order is `Path; Expires; Secure; HttpOnly; SameSite=lax` (Secure comes before HttpOnly).
- Reset request: a failing email provider leaves the token row stored and the error escapes (500). Earlier tokens stay valid.
- Reset confirm: expired and wrong-email tokens are consumed (burned); a corrupt token row throws after being deleted.
- Documents POST: the client's `publicationState` and `publication` are trusted. Auth is checked before body validation (401 beats 400); the Studio flag is checked before auth.
- Publish: the Kernel fails the whole build if any registered `content/<dir>` is missing (ENOENT).
- Middleware: a corrupt session row throws (500) instead of denying, but only for protected paths; expiry is strict (`expiresAt == now` is rejected); the row's `token` field is not compared to the cookie; the middleware never deletes expired rows.

## Coverage per target

| Target                     | Status                                            | What is missing                                                                                                                                 |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| login                      | Fully characterized at handler level              | HTTP-level cookie (see gap 1); the timing decoy hash is not asserted                                                                            |
| logout                     | Fully characterized at handler level              | gap 1                                                                                                                                           |
| reset-password             | Fully characterized at handler level              | Resend HTTP call itself (gap 3)                                                                                                                 |
| reset-password/confirm     | Fully characterized at handler level              | none beyond gap 1 (no cookie is set)                                                                                                            |
| studio/documents GET, POST | Partially                                         | relationship-error messages of `validate()` against other published drafts; concurrent saves                                                    |
| publish                    | Partially                                         | relationship validation against other published drafts; concurrent publishes; the effect (not just the call) of `revalidatePath` / cache resets |
| middleware                 | Partially                                         | Next's matcher and the Edge runtime are not exercised (only `config` is asserted); Supabase outage behaviour                                    |
| kernel/authoring.ts        | Definitions of all 9 kinds and 4 validation cases | `materializeAuthoringObjects` output                                                                                                            |
| scrypt                     | 6 committed vectors                               | Python check is step 2                                                                                                                          |

## Residual gaps (for step 2 or a manual check)

1. **No end-to-end HTTP check of Set-Cookie.** Handlers write cookies through `next/headers`; Next's runtime merges them into the real response. Tests assert the serialized text from Next's `ResponseCookies`, not the bytes of a real HTTP response. Needs `next start` plus a client.
2. **No real Supabase.** The adapter is replaced by an in-memory fake that assumes: JSON round trip, `list` ordered by id ascending, a miss returns `undefined`. The real PostgREST behaviour (errors, ordering, row-size limits) is not observed here. Behaviour when Supabase is down (adapter throws) is therefore unobserved for middleware and routes.
3. **No real Resend call.**
4. **Per-process rate limit** cannot be characterized across instances or restarts.
5. **Windows only** (paths, temp directories); the CI Linux run is unexecuted.
6. The Studio **pages** (Server Components that read the repository directly, audit F1) are not covered.

## TODOs left on purpose

- `fixtures/authoring-contract/authoring-contract.test.ts`: step 2 must add `backend/tests/test_authoring_contract.py` over `definitions.json` and `validation-cases.json` (audit F2).
- `fixtures/auth-contract/auth-contract.test.ts`: step 2 must add the Python check over `scrypt-vectors.json` (audit F5).
