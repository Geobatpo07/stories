# Phase 4 write-path audit: do the Studio and auth routes call Python?

Question left open in ADR-004, "No TypeScript/Python duplication left standing".
Audit only: no code was changed. Every conclusion below was checked by reading the files with
`git show <branch>:<path>` on the branch named in the heading, not on a working tree.

## Answer

**On every one of the five branches, every write route still runs its original TypeScript logic.
None of them calls Python.** The Python ports (`backend/api/app.py`, branches 2a, 2c and 2d) are
complete, tested, and **not called by any write path**: this is exactly the "tested dead code"
case ADR-004 says to avoid.

What _was_ rewired (branch `migration/phase4-frontend-repoint`, step 2d) is the **read path**: the
three Studio pages, through `lib/python-api.ts` (`PYTHON_API_BASE_URL`), plus the editor's two
`fetch` calls, through `lib/studio-client.ts`. That one is "hybrid by configuration", see below.

## Step 1: branches, PRs and CI

All five pushed as-is (no rebase, no rewrite). They are one stacked chain, not five independent
lines: each contains the previous one. All diverged from `main` at the same commit, `2969512`
(`origin/main` is now `784ea70`).

| Branch                                   | Head SHA  | Diverged from main at | PR (draft)                                           | CI run                                                                        | Result                                                                                               |
| ---------------------------------------- | --------- | --------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `migration/phase3-build-pipeline`        | `17efb8c` | `2969512`             | [#7](https://github.com/Geobatpo07/stories/pull/7)   | [39883199642](https://github.com/Geobatpo07/stories/actions/runs/39883199642) | `verify` success, `python-artifact` success                                                          |
| `migration/phase4-audit`                 | `a7732bf` | `2969512`             | [#8](https://github.com/Geobatpo07/stories/pull/8)   | **none**                                                                      | PR is `mergeable_state: dirty`: GitHub starts no `pull_request` run on a PR that conflicts with main |
| `migration/phase4-auth-port` (2a)        | `9af1ba6` | `2969512`             | [#9](https://github.com/Geobatpo07/stories/pull/9)   | [39883208429](https://github.com/Geobatpo07/stories/actions/runs/39883208429) | `verify` **failure**, `python-artifact` success                                                      |
| `migration/phase4-github-publish` (2c)   | `d57ca21` | `2969512`             | [#10](https://github.com/Geobatpo07/stories/pull/10) | [39883212164](https://github.com/Geobatpo07/stories/actions/runs/39883212164) | `verify` **failure**, `python-artifact` success                                                      |
| `migration/phase4-frontend-repoint` (2d) | `e8a480f` | `2969512`             | [#11](https://github.com/Geobatpo07/stories/pull/11) | [39883216180](https://github.com/Geobatpo07/stories/actions/runs/39883216180) | `verify` **failure**, `python-artifact` success                                                      |

Chain, oldest first: `fbae102` ADR → `bc93d53` spike → `60d30a2` schemas/kernel → `cb175d2` merge →
`d742f59`, `17efb8c` (phase 3) → `14b98fc`, `a7732bf` (phase 4 audit, characterization tests) →
`0ab37d8` login rate-limit (same fix as merged PR #4, different SHA) → `9af1ba6` (2a) →
`d57ca21` (2c) → `e8a480f` (2d). Check yourself: `git log --oneline 2969512..origin/<branch>`.

Failures, reported as found, nothing fixed here:

- **#9, #10, #11 (identical cause).** One test, `app/api/auth/reset-password/route.test.ts`
  "defaults the link base to http://localhost:3000 and the sender to onboarding@resend.dev":
  `expected [ { apiKey: 'ci-placeholder', … } ] to deeply equal [ { apiKey: '', … } ]`. The test
  assumes the three env vars are unset, CI sets placeholders. Already known and already fixed on
  PR #5's chain (commit `57a0074`, see `PHASE4-CI-FINDINGS.md`); these branches pre-date it. It is
  not caused by 2a/2c/2d. `python-artifact` is green on all three (that job runs on Python 3.12;
  ruff and mypy are not in these branches' workflow).
- **#8.** `git merge-tree origin/main migration/phase4-audit` reports
  `CONFLICT (add/add): app/api/auth/login/route.test.ts` (main has the rate-limit test from PR #4,
  this branch has the older characterization test). No CI run exists for it, so #8 has _no_
  green/red signal.
- #7 is green; it includes the merge of `migration/phase-2.5-reconciliation` as of its own time.

## Step 2: route by route

Handler code is quoted from `migration/phase4-frontend-repoint` (`e8a480f`). **Blob hashes of
these six route files are identical on `phase4-auth-port`, `phase4-github-publish` and
`phase4-frontend-repoint`**, so the conclusion is the same on all three (verified with
`git rev-parse <branch>:<path>`). Differences by branch are listed per route.

### `app/api/studio/documents/route.ts`: POST (save a draft)

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { contentTypeSchema } from "@/schemas";
import { authoringWorkflow, isStudioEnabled, knowledgeObjectRepository } from "@/authoring/server";
import { getStudioSession } from "@/auth/server";
...
export async function POST(request: Request) {
  if (!isStudioEnabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await getStudioSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = draftSchema.safeParse(await request.json());
  ...
  const result = await authoringWorkflow.saveDraft({ ...input, fields });
  return NextResponse.json(result);
}
```

**Conclusion: executes the original TypeScript logic.** Session check, zod validation, slug
derivation and `authoringWorkflow.saveDraft` are all local. No import or call reaches Python.
Python equivalent exists: `@app.post("/api/studio/documents")` in `backend/api/app.py` (2a and later).
Verified on: `phase4-audit` (no Python API exists there), `phase4-auth-port`,
`phase4-github-publish`, `phase4-frontend-repoint` (same blob `a017d5dd` on all four).

### `app/api/studio/documents/[id]/publish/route.ts`: POST (publish)

```ts
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { authoringWorkflow, isStudioEnabled } from "@/authoring/server";
import { getStudioSession } from "@/auth/server";
import { resetRuntimeContext } from "@/lib/presentation/runtime";
import { resetLaboratory } from "@/lib/presentation";
...
    const { document, report } = await authoringWorkflow.publish(id);
    resetRuntimeContext();
    resetLaboratory();
    revalidatePath("/", "layout");
```

**Conclusion: executes the original TypeScript logic.** Publication and revalidation are done in
process. The Python port (`@app.post("/api/studio/documents/{id}/publish")`, GitHub target from
2c) is not reached from here. Same blob `02477b5a` on all four branches above.

### `app/api/auth/login/route.ts`: POST

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { authWorkflow, writeSessionCookie } from "@/auth/server";
...
const attempts = new Map<string, { count: number; windowStart: number }>();   // rate limiter
...
  const result = await authWorkflow.login(email, password);
  ...
  await writeSessionCookie(result.sessionToken, result.expiresAt);
```

**Conclusion: executes the original TypeScript logic** (credential check, in-memory rate limiter,
cookie). Python port: `@app.post("/api/auth/login")`, with its own copy of the limiter.
Branch differences: `phase4-audit` has the pre-fix route (blob `0c9527d7`, email-keyed limiter);
`auth-port`, `github-publish`, `frontend-repoint` have the IP-keyed fix (blob `2e1ca1fa`). Both
are TypeScript.

### `app/api/auth/reset-password/route.ts`: POST

```ts
import { authWorkflow } from "@/auth/server";
...
  await authWorkflow.requestPasswordReset(parsed.data.email);
```

**Conclusion: executes the original TypeScript logic.** Port: `@app.post("/api/auth/reset-password")`.
Same blob `0b634909` on all five branches.

### Other state-changing routes under `app/api/auth/**`

- `reset-password/confirm/route.ts` (POST): `authWorkflow.confirmPasswordReset(token, password)`
  imported from `@/auth/server`. **Original TypeScript logic.** Port exists
  (`/api/auth/reset-password/confirm`). Blob `4b5d29b4`, identical on all five.
- `logout/route.ts` (POST): `authWorkflow.logout(token)` and `clearSessionCookie()` from
  `@/auth/server`. **Original TypeScript logic.** Port exists (`/api/auth/logout`). Blob
  `c5c0ab44`, identical on all five.
- `app/api/internal/revalidate/route.ts` (only on `github-publish` and `frontend-repoint`) is the
  one new TypeScript route: it is the endpoint the _Python_ publish calls back, so it is an
  intended call from Python into Next, not a Next route delegating to Python. It is only
  exercised if the Python publish is ever called, which nothing does today.

`auth/server.ts` and `authoring/server.ts` import only `next/headers`, `@/runtime`, and local
`./repository`, `./workflow` modules. No Python client anywhere in them.

### `components/authoring/`: "only its base URL changes"

Mixed, and different per branch:

| Branch                                        | `studio-editor.tsx` (save, publish)                                                                                      | `auth-forms.tsx` (login, reset, confirm)                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `phase4-audit`, `auth-port`, `github-publish` | `fetch("/api/studio/documents", …)`, ``fetch(`/api/studio/documents/${saved.id}/publish`)``: same origin, Next route     | `fetch("/api/auth/login")`, `/api/auth/reset-password`, `/api/auth/reset-password/confirm`: same origin, Next routes |
| `phase4-frontend-repoint`                     | `studioApiFetch(...)`, which does `fetch(`${NEXT_PUBLIC_PYTHON_API_BASE_URL ?? ""}${path}`, { credentials: "include" })` | unchanged, same origin, Next routes                                                                                  |

So the plan's promise is **done for the editor only on `frontend-repoint`, and only conditionally**:
the path is unchanged and the base URL comes from `NEXT_PUBLIC_PYTHON_API_BASE_URL`. `.env.example`
on that branch sets it to `http://127.0.0.1:8000`, but with the variable unset (the
`lib/studio-client.ts` default) the editor still posts to the Next route, i.e. to TypeScript.
**The login, password-reset and confirm forms were never repointed on any branch.** So even with
the variable set, the _editor_ talks to Python while the _auth forms_ and every Next route still
run TypeScript. Note the Next routes remain deployed and reachable regardless of the variable.

## Per-branch summary

| Branch                         | Write routes call Python? | Python port present?                                   | Editor/forms call Python?                                                    | Reads call Python?                                               |
| ------------------------------ | ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `phase4-audit`                 | no                        | no (characterization tests only)                       | no                                                                           | no                                                               |
| `phase4-auth-port` (2a)        | no                        | yes, `backend/api/app.py`                              | no                                                                           | no                                                               |
| `phase4-github-publish` (2c)   | no                        | yes, plus GitHub target and `/api/internal/revalidate` | no                                                                           | no                                                               |
| `phase4-frontend-repoint` (2d) | **no**                    | yes                                                    | editor: **only if `NEXT_PUBLIC_PYTHON_API_BASE_URL` is set**; auth forms: no | yes, three pages via `lib/python-api.ts` (`PYTHON_API_BASE_URL`) |

## Tested dead code

Yes, in the terms of ADR-004. On `auth-port`, `github-publish` and `frontend-repoint`, the Python
`/api/auth/*` and `/api/studio/*` handlers are covered by their own tests (see
`PHASE4A-FINDINGS.md`, `PHASE4C-FINDINGS.md`, `PHASE4D-FINDINGS.md`) and no route on the Next side delegates to them. The
Python write path is live only through the editor with the env var set, and the TypeScript
originals are still present, deployed and reachable alongside it. The duplication ADR-004 forbids
is therefore **currently standing** for all six write/auth routes and the three auth forms. Closing
it needs a decision (delegate in the route handlers, or route `/api/*` to Python at the platform,
then delete the TypeScript routes at the Phase 7 gate); that was not done here.

## Not done / limits

- No code changed on any branch; no PR merged; no CI problem fixed.
- #8 has no CI run (conflict); the failing test on #9–#11 is the known pre-fix one, not re-run
  after a fix.
- I read the code; I did not exercise the routes at runtime for this audit. The runtime behaviour
  of the editor against Python was observed earlier in `PHASE4D-FINDINGS.md` (manual run), on 2d only.
- Branches `phase4-auth-port` etc. remain stacked; the PRs show the cumulative diff against `main`.
