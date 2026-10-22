# Phase 4, step 3: the Studio frontend calls the Python API

Branch `migration/phase4-frontend-repoint`, on `d57ca21`. Raw output: `evidence/phase-4d/` and
`evidence/phase-4d-negative-controls.txt`.

## What changed

- `lib/python-api.ts` (server): `pythonApiGet(path)` reads `stories_studio_session` with `cookies()`
  and forwards **only that cookie** as a `Cookie` header on every call, `cache: "no-store"`, 10 s
  timeout. Base URL from `PYTHON_API_BASE_URL` (unset = error before any request).
  401 -> `redirect("/studio/login")`; 404 with the API's own `{"error":"Not found"}` (Studio
  disabled) -> `notFound()`; any other 404 (FastAPI's `{"detail"}`, i.e. a wrong base URL) and every
  other failure, unreachable included -> `PythonApiError`, which reaches the app's existing
  `app/error.tsx`. No new error UI; nothing is turned into an empty list.
- `lib/studio-data.ts`: list documents, list definitions, relationship options (was duplicated in
  two pages), and `newStudioDraft(definition)`.
- The three pages no longer import `@/authoring/server` or runtime `@/kernel`.
  `documents/[id]` = list + find (the API has no get-by-id route); `new/[kind]` = definitions + list.
- `components/authoring/studio-editor.tsx`: save and publish go through `lib/studio-client.ts`
  (`NEXT_PUBLIC_PYTHON_API_BASE_URL`, `credentials: "include"`); a rejected fetch now sets the
  "error" save state (before, it stayed on "saving").
- Python: CORS middleware, only when `STUDIO_ALLOWED_ORIGINS` is set; credentials allowed; `*` is
  dropped. `uvicorn` added as a dependency (it was not).
- Docs: `.env.example`, `docs/operations/DEVELOPER-WORKFLOW.md` (two processes: `uv run uvicorn
main:app --port 8000` from `backend/`, and `pnpm dev`).
- Not touched (diff is empty): `middleware.ts`, `auth/server.ts`, `app/api/**`, `kernel/**`, the
  protected layout, the login page, `vercel.json`.

## Decisions to review

1. **`createDraft` is duplicated in TypeScript** (`newStudioDraft`). The API has no draft-creation
   route, and a draft only exists once the editor first saves it. A Python route would need a
   decision on whether an unsaved draft should be persisted; I did not make it.
2. **Browser calls go cross-origin**, which needs CORS and, in production, the same site (cookie is
   `SameSite=lax`; `localhost:3001` -> `:8000` is same-site, `a.com` -> `b.com` is not). Phase 6
   (same-origin routing) removes this; until then it is a dev-only arrangement.
3. **Auth forms are unchanged**: login, reset and logout still POST to Next's `/api/auth/*`
   (the brief scoped the `/api/studio` calls). So login still runs on the TypeScript route; its
   cookie works against Python (seen below).
4. Response bodies are cast, not validated (`as T`). A drifting API shape fails at render time.

## Verification

- `pnpm typecheck` exit 0; `pnpm lint` exit 0, no warnings; `pnpm test` **800 passed, 1 skipped**
  (777 + 23 new, `app/studio/pages.test.tsx`). `pytest` **1130 passed** (1125 + 5 CORS); ruff clean
  on `api/` and the new test. (mypy `api` reports 22 errors in `pipeline/` etc., identical on the
  base commit; none in `api/`.)
- The existing suite had one 5 s timeout (the step-1 test "answers 404 ... STORIES_STUDIO_ENABLED",
  the same flake as in 4C) on a run that overlapped other work; it passed on the rerun.
- No existing Server Component test existed. Smallest approach used: call the async page function
  directly with `next/headers` and global `fetch` faked, and render the returned element with
  `react-dom/server`. No new dependency.
- Tests cover, for each of the three pages: the outgoing fetch carries
  `Cookie: stories_studio_session=<token>` on both calls (and sends no cookie header without one);
  happy path; unreachable API; 500; unset base URL. Plus 401, 404 variants, unknown id, non-editable
  kind.
- Negative controls: 10 TypeScript mutations, **10 caught**; 4 CORS mutations, 3 caught, 1 survivor
  that is an equivalent mutant (an empty allow list changes nothing observable).

## Manual run (real Python service, real Next dev server)

Setup: no Supabase project exists, so both services pointed at a 60-line in-memory PostgREST stand-in
(`evidence/phase-4d/fake_postgrest.py`). Port 3000 was taken by another process, so Next ran on 3001
with `STUDIO_ALLOWED_ORIGINS=http://localhost:3001`. Admin created with the TS script
`pnpm studio:auth:init`; login through Next's TS route.

- The cookie minted by the TypeScript login was accepted by the Python API (`GET
/api/studio/documents` 200 in `manual-python.log`): sessions are cross-compatible.
- `/studio`: HTML contains "Knowledge Authoring Studio", the seven kind cards, the empty state; after
  saving a draft, the title and `href="/studio/documents/<id>"`.
- `/studio/new/note`: editor with the note fields. `/studio/new/experiment`: not-found markup.
- `/studio/documents/<id>`: editor with `value="Manual Run Note"` and the body; unknown id: not-found.
- Browser-style calls to Python: preflight 200 with `access-control-allow-origin` and
  `-credentials`; save with cookie + `Origin` 200, slug auto-generated.
- No cookie: `/studio` 307 to `/studio/login` (still the TS middleware).
- Python stopped: all three pages logged `PythonApiError: The Python API is unreachable at
http://127.0.0.1:8000.` in the Next log and served the Suspense error marker (`$RX`).

## NOT done / does not fully close

- **I did not see the pages in a browser**, and have no screenshots: the error boundary rendering
  after `$RX` happens on the client, and was inferred, not observed. The HTTP status of a failing
  page is 200 because `app/loading.tsx` streams the shell before the page throws (true of any error
  in these pages before this change).
- Save, publish and the editor's browser-side calls were exercised with `curl` carrying the same
  headers, not by clicking in the editor. Publish got a 422 from my incomplete payload (missing
  `noteType`), so a successful publish was not seen here (it is covered, against a fake GitHub, in 4C).
- **Nothing ran against a real Supabase, GitHub, Resend or Vercel.** This does not satisfy Phase 7's
  gate; the old `app/api/studio/**`, `app/api/auth/**` and `kernel/authoring.ts` stay.
- Auth forms still on TS routes (decision 3); middleware decision F6 unchanged by design.
- Python 3.12 / Linux / the CI job `python-artifact` not run (3.13, Windows). CI does not start the
  Python service for the Next tests (they fake it).
- Still open from 4C: deployment tracking, revalidation actually surfacing content.
