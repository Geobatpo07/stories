# Phase 4, step 2b: GitHub publication target and site revalidation

Branch `migration/phase4-github-publish`, on `9af1ba6`. Raw output: `evidence/phase-4c/` and
`evidence/phase-4c-negative-controls.txt`. **Nothing here called the real GitHub API**: it is
exercised only against an in-memory fake (`tests/github_fake.py`) that follows the documented rules.

## Research (GitHub's own docs, fetched verbatim; nothing is quoted from memory)

**Contents API vs Git Data API.**

- Contents (`docs.github.com/en/rest/repos/contents`): one file per call; update/delete need that file's blob `sha` ("Required if you are updating a file. The blob SHA of the file being replaced."; delete: "The blob SHA of the file being deleted."). And: "If you use this endpoint and the "Delete a file" endpoint in parallel, the concurrent requests will conflict and you will receive errors. You must use these endpoints serially instead." A slug change (write + delete) would be two commits, the second able to fail after the first succeeded.
- Git Data (`/rest/git/trees`, `/commits`, `/refs`): `base_tree` ("Entries defined in the tree parameter will overwrite items from base_tree with the same path"); a tree entry with `sha: null` deletes ("If the value is null then the file will be deleted", and "Returns an error if you try to delete a file that does not exist"); `content` inline ("GitHub will write this blob out and use that SHA for this entry"); commit `parents` / `tree`; ref update `force` ("Leaving this out or setting it to false will make sure you're not overwriting work", default `false`).
- **Chosen: Git Data.** One tree holds both changes, one commit, one ref update that is a fast-forward or nothing. That is the closest to the TypeScript publish() "write the new MDX and delete the old one" as a single operation. (GraphQL `createCommitOnBranch` also does additions and deletions in one mutation with `expectedHeadOid`, but "does not support specifying the author or committer"; REST was kept because the whole service uses plain `httpx` REST calls.)

**Credential.** A fine-grained personal access token restricted to this one repository with the repository permission **Contents: Read and write** (Metadata: read is implicit). The fetch of the permissions page was truncated, so the endpoint-to-permission rows (trees/commits and ref update: write; ref/commit/tree reads and tarball: read) come from a summary, and the "additional permissions" marker on the ref-update row is **unverified**. Check the `X-Accepted-GitHub-Permissions` header when the token is first used. If `main` is protected, the token owner must be allowed to push (GitHub does not document the exact API error text for that). **No token exists or is hard-coded: a person must create it and store it** as `GITHUB_PUBLISH_TOKEN` (see `.env.example`).

**Not confirmed by the docs** (flagged, not assumed): that `GET /tarball/{ref}` accepts a commit SHA; the top-level folder name inside the archive (the code strips whatever the first folder is); the exact error code of a non-fast-forward ref update (the code treats 409 and 422 as a conflict); the current default API version (`2022-11-28` is sent).

## Design: validate first, commit once

1. `GET git/ref/heads/main` then `GET git/commits/{sha}`: pin ONE head commit and its tree.
2. `GET tarball/{head sha}` (302 to codeload, redirect followed): extract only regular files under `content/` into a temp directory (traversal, absolute paths, links skipped; 200 MB cap).
3. Apply the change there and run the **real Python build pipeline** (Phase 3, including the duplicate-id check the TypeScript pipeline never had). Failure raises `Publication validation failed.\n<report in the TypeScript renderReport format>`: **no write to GitHub has happened** (asserted: only GETs were made).
4. Only then: one `POST git/trees` (`base_tree` = head's tree; the new file inline; the old path with `sha: null` only if it exists in the snapshot), one `POST git/commits` (parent = the pinned head), one `PATCH git/refs/heads/main` with `force: false`. A branch that moved makes step 4 a `PublicationConflictError` ("nothing was published, try again"), never an overwrite.
5. Identical content and nothing to delete: validated, no commit, `deployment: not_required`. This also makes a retry after a lost Supabase save harmless (test).

Why a tarball and not a local clone: Vercel's deployment disk is read-only and ephemeral, so a kept-in-sync clone is not available; the tarball is one request whatever the number of content files (recursive tree + one blob call per file would be N+1 calls). Trade-off: it downloads the whole repository, not only `content/`.

**Bookkeeping ("committed, deployment pending").** The API response now carries `deployment: {"status": "pending"}` plus `report.commit` (sha, url, branch, parent, written, deleted). The stored row deliberately keeps `publicationState: "published"` and the same `publication` keys: the live TypeScript Studio parses this same Supabase row with a closed Zod enum, so a new state would break it, and a stored "pending" could never be updated without the (out-of-scope) deployment tracking. Asserted by a test.

## Revalidation

- New `app/api/internal/revalidate/route.ts` (TypeScript, new file; no existing TS file touched): `POST`, header `x-revalidate-secret` vs `REVALIDATE_SECRET`, both sides sha256-hashed then compared with `crypto.timingSafeEqual` (equal-length buffers, no length leak); only `revalidatePath("/", "layout")`; 401 on mismatch, **503 when the secret is unset** (fail closed). `middleware.ts` does not match `/api/internal`.
- Python `NextRevalidator` posts to `${NEXT_PUBLIC_SITE_URL}/api/internal/revalidate`. It runs as a **background task after the response**: a failure is logged and never changes the 200.
- **Finding, open:** revalidating right after the commit cannot show the new content, because the committed MDX only reaches the site when Vercel's _next deployment_ of that commit is live; revalidating the current deployment re-renders from its old artifact. The call is kept as specified; its real trigger belongs to the deployment-tracking step. The TypeScript route also reset in-process caches (`resetRuntimeContext`, `resetLaboratory`); those are not reproduced (the new deployment starts clean).

## Verification

- `pytest -v`: **1125 passed** (1096 before: +29 GitHub/revalidation tests, test_api_studio net unchanged in count).
- `ruff` (format + check) and `mypy --strict` on all new Python: clean.
- `pnpm typecheck` exit 0; `pnpm lint` exit 0; `pnpm test`: **777 passed, 1 skipped** (766 + 11 new TypeScript tests). One earlier run had a 5 s timeout in the existing step-1 test "answers 404 ... unless STORIES_STUDIO_ENABLED is exactly 'true'" (it reloads the route graph four times) while the machine was loaded; it passed on the rerun. It is a pre-existing timing flake, not changed here.
- Negative controls, 15 (14 caught on the first single mutation; the 15th revealed a redundant guard), all reverted:
  build failure ignored; state saved despite a failed commit; forced ref update; delete entry dropped; commit parent dropped; unchanged content still committing; delete of a missing path; token omitted; revalidation failure not swallowed; deployment status not returned; archive traversal guard (removing only the first guard survives because a second normalisation guard backs it up: removing both fails); TypeScript: constant-time comparison replaced by `===`, `revalidatePath` argument changed, unset secret no longer fails closed.

## Covered vs still open

| Item                                                                                        | State                                                                                     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Validate before commit; no GitHub write on failure                                          | covered (fake GitHub)                                                                     |
| One atomic commit for write + delete; fast-forward only; conflict on a moved branch         | covered (fake GitHub)                                                                     |
| Failed commit leaves the draft unpublished and refreshes nothing                            | covered                                                                                   |
| Constant-time secret check, fail-closed when unset                                          | covered                                                                                   |
| Real GitHub API, real token, branch protection, rate limits, tarball by SHA, real Vercel    | **never exercised**                                                                       |
| Following Vercel's deployment and auto-reverting a failed one                               | **open, out of scope** (a commit that passes the pre-check can still fail Vercel's build) |
| Revalidation actually surfacing new content                                                 | **open** (see finding)                                                                    |
| Next.js Studio UI still on the TypeScript routes; nothing deployed; `vercel.json` untouched | unchanged                                                                                 |
| Python 3.12 / Linux / CI job `python-artifact`                                              | not run (3.13, Windows only)                                                              |
