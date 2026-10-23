# Write routes now delegate to Python (ADR-004 phase 4, write-path)

Branch `migration/phase4-write-relay`, based on `migration/phase4-frontend-repoint` (`e8a480f`).
Pushed, no PR, nothing merged. #7 to #10 and the 2a/2b/2c branches untouched.

## What changed

`lib/python-api.ts` gains `pythonApiRelay(request, path)`: reads the session cookie with `cookies()`,
forwards only that cookie as an explicit `Cookie` header, plus the raw body, `content-type` and
`x-real-ip` (without it Python's per-IP login limiter would see the Next server for every visitor).
It returns the Python status, body, content-type and every `Set-Cookie` as is. The only responses
it invents are for "no Python answer": **503** (`PYTHON_API_BASE_URL` unset) and **502** (unreachable
or 30 s timeout). Publish ids are URL-encoded into the path.

Six commits, one per route (`git show <sha>` is the diff; each route is now 3 to 7 lines):

| Route                           | Commit    | Python endpoint                      | Logic left in the route                                                                  |
| ------------------------------- | --------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `auth/login`                    | `0dc6a8c` | `/api/auth/login`                    | none; the TS limiter (`MAX_ATTEMPTS`, `WINDOW_MS`, `Map`) is deleted in this same commit |
| `auth/logout`                   | `bd23cc2` | `/api/auth/logout`                   | none                                                                                     |
| `auth/reset-password`           | `65fa143` | `/api/auth/reset-password`           | none                                                                                     |
| `auth/reset-password/confirm`   | `cb173fe` | `/api/auth/reset-password/confirm`   | none                                                                                     |
| `studio/documents` POST         | `78f70f6` | `/api/studio/documents`              | none (zod schema removed)                                                                |
| `studio/documents/[id]/publish` | `7fad296` | `/api/studio/documents/{id}/publish` | none                                                                                     |

All six: **pure HTTP relay, no business rule left.** Only one limiter is ever active (the Python one).

## Characterization tests, before and after

- Before (`e8a480f`): `evidence/phase-4-relay/characterization-before.txt`: 115 passed (104 for the
  six routes + 11 for `internal/revalidate`).
- After repointing, **unmodified** (`characterization-after-unmodified.txt`): **94 of the 104 fail**
  (login 30/31, documents 20/27, confirm 17/18, reset 11/12, publish 10/10, logout 6/6).
  This is a structural, not a behavioural, signal: those tests drive the TypeScript workflow
  against in-memory fake Supabase/Resend adapters, and the route no longer runs that code, so
  they cannot pass without a Python server behind them. They were **not edited to pass**.
- I therefore deleted those six test files (separate commit, recoverable from `e8a480f`) and
  replaced them with `app/api/relay.test.ts` (73 tests, 6 routes x method/path/body/cookie/status
  passthrough/Set-Cookie/502/503 + id encoding). The behaviour they pinned is carried by the Python
  tests (`backend/tests/test_api_login.py`, `test_api_logout_reset.py`, `test_api_studio.py`), which
  were written as the port of those cases in step 2a. I did not re-prove that correspondence case
  by case here.
- Negative controls on the relay (mutate, run, restore): no cookie forwarding -> 6 fail; no
  Set-Cookie passthrough -> 6 fail; status forced to 200 -> 36 fail.
- After: `pnpm typecheck` clean, `pnpm lint` clean, `vitest` 769 passed + 1 skipped.

## Live run (real Next dev server + real Python + the 4d in-memory PostgREST stand-in)

Through Next (`:3002`) to Python (`:8000`): bad login 401; invalid body 400; no-cookie save 401;
good login 200 with `Set-Cookie: stories_studio_session=...; Path=/; Expires=...; HttpOnly;
SameSite=lax`; save 200 (slug generated); reset 200; logout 200 with the cleared cookie; save after
logout 401; publish 422 (the draft lacked required note fields; Python's message came back
verbatim); Python stopped: 502 `The Python API is unreachable...`. `live-python.log` shows each
request landing on Python (9 POSTs).

## Forms (step 4): deviation, please decide

`auth-forms.tsx` uses hard-coded same-origin `fetch("/api/auth/login" | ".../reset-password" |
".../confirm")`. They now reach Python **through the relay routes**, so they already run Python
logic without a code change. I did not switch them to `studioApiFetch` (direct-to-Python): the
login `Set-Cookie` would then be issued by the Python host, not the site's, which breaks
`middleware.ts` (reads the cookie on the Next origin) wherever the two are on different hosts. That
same concern applies to the editor's direct calls from 2d; the editor could use same-origin paths
through these relays instead. Left as is; your call.

## Fallback check (step 5)

- CI (`ci.yml`) defines neither `PYTHON_API_BASE_URL` nor `NEXT_PUBLIC_PYTHON_API_BASE_URL`; the new
  tests stub the former, so CI needs neither. No CI job starts Next against Python.
- No documented deployment sets them (only `.env.example` and the developer workflow, now with a
  production note added).
- But there is **no silent fallback to TypeScript any more**: the TS logic is deleted. Unset
  `PYTHON_API_BASE_URL` -> relay 503; `NEXT_PUBLIC_...` unset -> editor posts same-origin to the
  relay -> Python. A misconfigured environment fails loudly.

## Things you should know / not done

- **Publish behaviour changes, not just the executor.** The TS route published to the local file
  system, then called `resetRuntimeContext()`, `resetLaboratory()` and `revalidatePath`. Python
  commits to GitHub and calls `/api/internal/revalidate` (`revalidatePath` only). The two in-process
  cache resets are not called any more. New content appears after the Vercel build anyway, but this
  was not exercised; real GitHub/Vercel remain unvalidated.
- `GET /api/studio/documents` still runs TypeScript (`knowledgeObjectRepository.list()`): not one
  of the six, and no UI caller since 2d. Python has the equivalent; it is the one remaining
  duplicate on this route file.
- The Python limiter trusts `x-real-ip` only when `VERCEL=1` is set on the **Python** service
  (documented). Behind Next, set it there; otherwise production uses one shared bucket.
- A 5xx or 4xx from Python is passed through; a thrown error inside Python is Python's 500 body.
- `middleware.ts`, `auth/server.ts` (session validation) still read Supabase from Next, as before.
- Not run: browser UI, real Supabase/Resend/GitHub/Vercel, CI on this branch (no PR opened).
