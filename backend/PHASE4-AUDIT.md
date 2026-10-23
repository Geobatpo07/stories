# Phase 4 audit: authoring + auth to Python (ADR-004)

Scope of this pass: read-only audit and plan. No application code was written or changed.
Branch `migration/phase4-audit`, from `migration/phase3-build-pipeline` (`17efb8c`).

## 1. What exists today (inventory)

| Area             | Files                                                                                           | Lines | Tests                                                 |
| ---------------- | ----------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| auth core        | `auth/{passwords,types,repository,workflow,server,index}.ts`                                    | ~350  | `passwords.test.ts` (37), `workflow.test.ts` (176)    |
| auth routes      | `app/api/auth/{login,logout,reset-password,reset-password/confirm}/route.ts`                    | ~110  | none                                                  |
| authoring core   | `authoring/{types,repository,workflow,server}.ts`, `renderers/mdx-renderer.ts`                  | ~370  | `workflow.test.ts` (110), `mdx-renderer.test.ts` (46) |
| studio routes    | `app/api/studio/documents/route.ts` (GET, POST), `.../[id]/publish/route.ts` (POST)             | ~80   | none                                                  |
| gate             | `middleware.ts` (68)                                                                            |       | none                                                  |
| kernel authoring | `kernel/authoring.ts` (193; field definitions, field validation, `materializeAuthoringObjects`) |       | `kernel/authoring.test.ts` (69)                       |
| persistence      | `runtime/adapters/supabase-persistence-adapter.ts` (PostgREST `fetch`)                          |       | adapter test                                          |
| UI               | `components/authoring/{auth-forms,studio-editor}.tsx`, `app/studio/**`                          |       | `studio-editor.test.tsx`                              |

HTTP surface (the contract FastAPI must match):

| Route                                    | Request                  | Responses                                                                                                         |
| ---------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`                   | `{email, password}`      | 200 `{success}` + `Set-Cookie`; 400, 401 `Incorrect email or password.`, 429 (10 per 15 min per email, in memory) |
| `POST /api/auth/logout`                  | none                     | 200 `{success}`, cookie cleared                                                                                   |
| `POST /api/auth/reset-password`          | `{email}`                | 200 `{success}` whether or not the email exists; 400                                                              |
| `POST /api/auth/reset-password/confirm`  | `{token, password >= 8}` | 200; 400 with `error` text                                                                                        |
| `GET /api/studio/documents`              | none                     | 200 `{documents}`; 401; 404 if Studio disabled                                                                    |
| `POST /api/studio/documents`             | draft payload            | 200 `{document, validation}`; 400; 401; 404                                                                       |
| `POST /api/studio/documents/:id/publish` | none                     | 200 `{document, report}`; 422 `{error}`; 401; 404                                                                 |

Session cookie: `stories_studio_session`, httpOnly, sameSite lax, secure in production, path `/`, expires = session expiry. Sessions live 12 h, reset tokens 1 h.

## 2. Findings that change the plan

**F1. Server Components bypass the API entirely.** `app/studio/**` pages call `knowledgeObjectRepository.list/find`, `authoringWorkflow.createDraft`, `getStudioSession()` and `isStudioEnabled()` in-process, reading Supabase directly. The ADR says to repoint the forms, but the pages are a second consumer that the ADR does not mention. Deleting the TypeScript authoring/auth code means rewriting these pages to call the Python service, or keeping a TypeScript read path.

**F2. Field definitions are not in the Python Kernel.** `kernel/authoring.ts` (`listAuthoringDefinitions`, `getAuthoringDefinition`, `validateAuthoringFields`, `materializeAuthoringObjects`) drives both the editor forms (pages import it) and server validation. Phase 2 did not port it. Porting authoring requires it, and the form definitions then need one source of truth (Python serving them over HTTP, or a generated JSON both sides read). Two hand-maintained copies would drift.

**F3. Publishing cannot work on Vercel, today or after the port.** `AuthoringWorkflow.publish()` writes an MDX file under `content/` on the local disk, then runs the build. `docs/operations/KNOWLEDGE-AUTHORING.md` says the Studio needs "a durable writable filesystem" and is off in production unless `STORIES_STUDIO_ENABLED=true`. A Python service on Vercel has the same read-only deployment filesystem. Phase 5's "brainstorm to publish" over MCP therefore has no working target in production. Real options: commit the MDX to Git through the GitHub API and let the deploy rebuild; or run the backend on a host with a writable, persistent disk. This is a design decision, not an implementation detail, and it needs to be made before Phase 5.

**F4. Publishing triggers Next.js cache invalidation that Python cannot do.** The publish route calls `resetRuntimeContext()`, `resetLaboratory()` and `revalidatePath("/", "layout")`. After the port, Python must call back into Next (a secret-protected revalidate endpoint) or the site will serve stale pages. Note also that the published pages read the artifact generated at build time, so a runtime publish does not change them until a rebuild.

**F5. Password hashes are portable, verified.** `hashPassword` uses Node `scrypt` with defaults (N=16384, r=8, p=1, 64 bytes), the salt is a hex string used as its UTF-8 bytes (not decoded), the password is UTF-8. I generated hashes with the real `auth/passwords.ts` and verified them in Python (`hashlib.scrypt`, same parameters, `maxmem` 64 MiB) for 4 passwords including `é–日本語🙂` and a 200-character one: 4 of 4 match. Decoding the salt from hex does not match (expected). So the existing admin credential keeps working and no password reset is needed.

**F6. Sessions can stay compatible if Python writes the same rows.** Rows are `persistence_records(namespace="auth", collection="auth-sessions", id=<token>)` with value `{token, createdAt, expiresAt}`; credentials are `auth/admin`, reset tokens `auth-reset-tokens/<token>`. If Python uses the same table, shapes and ISO timestamps, `middleware.ts` needs no change and existing sessions survive the cutover. The ADR proposes making the middleware call a Python session-validation endpoint instead. That adds a cross-service network hop to every `/studio` request and a new failure mode in the gate that is described in `middleware.ts` as load-bearing. Recommendation: keep the Supabase-reading middleware for Phase 4 and treat the endpoint as optional. This contradicts the ADR text, so it needs your decision.

**F7. Behaviours worth preserving exactly (and testing as such):**

- login runs a decoy hash for an unknown email (timing), compares email case-sensitively;
- reset request returns the same result for unknown emails;
- reset tokens are consumed (deleted) on read, valid or not;
- a successful reset destroys every session;
- expired sessions are deleted on validation;
- the login rate limit is per process and in memory, so it is weaker on serverless (documented as a simplification, but it will behave differently on a Python service).

**F8. Documentation is already stale.** `KNOWLEDGE-AUTHORING.md` still says drafts autosave under `knowledge/<kind>/`; they are in Supabase (`knowledge/README.md` says so). Worth correcting in whichever phase touches this.

**F9. Test inventory is thin where risk is highest.** The unit tests exercise the TypeScript classes. There are no tests for the six routes or the middleware. Deleting the TypeScript classes deletes those tests, so they must be ported to pytest first, and a route-level contract test (status codes, bodies, cookie attributes) must be written against the TypeScript routes before they are replaced, the same golden approach used in Phases 1 to 3.

## 3. Proposed plan (each step ends with raw evidence, branch per step, nothing pushed)

0. **Decisions** (below), before any code.
1. **Characterize the TypeScript behaviour**: route-level contract tests (golden request/response, cookie attributes, 401/404/422/429 paths) and a persistence-row golden (what is written to `persistence_records` for login, logout, reset, draft save, publish). No behaviour change.
2. **Python persistence port + auth core**: `PersistencePort` over PostgREST with `httpx`, repositories, `AuthWorkflow`, scrypt, email via Resend HTTP. Tests: ported unit tests, the F5 hash fixtures committed as a shared fixture, and a cross-language session test (a session created by Node is accepted by Python, and the reverse).
3. **Port `kernel/authoring.ts`** with a shared fixture contract (as for the schemas), and decide the single source for form definitions (F2).
4. **Authoring core in Python**: repository, `AuthoringWorkflow`, `MDXRenderer`. The renderer gets a byte-exact golden from the TypeScript output. Publication uses the Phase 3 `run_build_pipeline`, with the existing rollback semantics.
5. **FastAPI routes** matching section 1, plus the cache-revalidation callback (F4), run locally behind a rewrite so the browser stays same-origin.
6. **Repoint the UI**: forms (base URL) and the Server Components (F1), behind an opt-in switch like `STORIES_BUILD_PRODUCER`, default unchanged.
7. Only after parity evidence: removal of the TypeScript routes and classes. Not part of the first implementation pass.

## 4. Decisions needed from you

1. **Publishing target in production (F3):** Git commit through the GitHub API, a host with a writable disk, or keep publishing dev-only for now.
2. **Middleware (F6):** keep the Supabase-reading middleware (recommended) or call a Python endpoint as the ADR says.
3. **Form definitions (F2):** Python serves them over HTTP, or a generated JSON file is the shared source.
4. **Scope of the first implementation pass:** I suggest steps 1 and 2 only (characterization tests, then the auth core), since auth is the highest-risk piece and F5 and F6 make it the safest to land first.

## 5. Not verified in this audit

- Nothing was run against a real Supabase project (none is available here), so the row shapes in F6 come from the code, not from observed data.
- Vercel Services (ADR-004 Phase 6) was not checked; it is not needed for Phase 4.
- Only the scrypt compatibility was tested empirically; every other finding is from reading the code.
- `app/studio/**` pages and `studio-editor.tsx` were read only for their imports and fetch calls, not for full UI behaviour.
