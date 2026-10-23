# First CI run of the Python chain on Linux / Python 3.12

Evidence is the GitHub Actions record, not narrative. All runs are on
https://github.com/Geobatpo07/stories (`ubuntu-latest`; Python 3.12.15 from `actions/setup-python`).

## Step A: login rate-limit fix (merged)

- PR [#4](https://github.com/Geobatpo07/stories/pull/4), merged as a merge commit (the convention of
  PR #1) -> `main` = `ea5ed67`. The branch was already on `2969512`: no rebase needed.
- Run [39874633331](https://github.com/Geobatpo07/stories/actions/runs/39874633331), job `verify`,
  **success, 1 min 51 s**: install, build:knowledge, typecheck, lint, `pnpm test` (46 files, 199
  tests), build all success. No failure or flake; no difference from local.

## Step B: the Python chain (PR #5, draft, NOT merged)

PR [#5](https://github.com/Geobatpo07/stories/pull/5), branch `migration/python-pipeline-ci-v2`:
phases 1-3.5, the Phase 4 audit and the 4a tests, on top of `ea5ed67`. Built by cherry-picking
the seven non-merge commits of `migration/phase4-audit` onto `origin/main` (a `git rebase` was
refused by the local permission classifier). Only conflict: `app/api/auth/login/route.test.ts`
(add/add); `main`'s version was kept, because the 4a copy characterized the removed email-keyed
limiter. The `python-artifact` job already existed (Phase 3b, Python 3.12); I added `ruff` and
`mypy --strict` steps at its end (`if: !cancelled()`, tools fetched with `--with`, lock untouched).
Not a required check (`main` has no branch protection at all).

### Run 1: [39876091143](https://github.com/Geobatpo07/stories/actions/runs/39876091143) (commit `3f33019`)

- `verify`: **failed** at `pnpm test` (1 failed, 759 passed, 7 skipped):
  `app/api/auth/reset-password/route.test.ts > defaults the link base ...`,
  `expected [ { apiKey: 'ci-placeholder' ...} ] to deeply equal [ { apiKey: '' ...} ]`.
  Cause: my 4a test assumed `RESEND_API_KEY` & co. unset; the `verify` job exports placeholders.
  Invisible locally. A real test bug, not a platform difference.
- `python-artifact`: failure, only at the two static-check steps (below).

### Run 2: [39876414253](https://github.com/Geobatpo07/stories/actions/runs/39876414253) (commit `57a0074`, test fixed)

| Job / step                                  | Result                                           | Time       |
| ------------------------------------------- | ------------------------------------------------ | ---------- |
| `verify` (TypeScript, workflow unchanged)   | **success** (`pnpm test`: 760 passed, 7 skipped) | 1 min 25 s |
| `python-artifact`: uv sync --frozen         | success                                          | 0 s        |
| pytest -v                                   | success, **817 passed in 3.37 s**                | 5 s        |
| Python writes, Node reads (vitest, 7 files) | success, 457 passed                              | 4 s        |
| TS-built vs Python-built artifact parity    | success                                          | 4 s        |
| Real content parity (both producers)        | success                                          | 2 s        |
| ruff                                        | **failure**, 37 errors                           | 0 s        |
| mypy --strict                               | **failure**, 22 errors in 9 files                | 3 s        |

The fix (commit `57a0074`) is in the test only; the `verify` job itself is untouched and green.

## Linux 3.12 vs Windows 3.13

- **No behavioural difference found.** Same 817 pytest results; the DuckDB artifact written by Python
  on Linux is read by Node and byte-for-byte equal in the parity steps (the pinned
  `duckdb==1.5.2`/`@duckdb/node-api` pair works on Linux); the contract fixtures and scrypt vectors
  (generated on Windows) verify on Linux. No path-separator, iteration-order, or encoding failure
  in 817 tests.
- Static checks give **identical counts** on both platforms: ruff 37, mypy 22.
- Timing: pytest 3.37 s on the runner vs 8.1 s locally (same 817 tests); scrypt vector tests 300 ms
  and 548 ms in CI. Faster, not slower.
- Skips: `verify` skipped 7 tests in CI (the Python-producer tests, which need the backend venv that
  job does not create) vs 1 locally. Those same tests ran, unskipped, in `python-artifact`. Env,
  not OS.
- CI-only trait found: placeholder env vars exported by `verify` leak into any test that assumes
  an unset variable (the one failure above). Other tests of the suite are not affected (760 pass).

## Static checks (new signal; both red)

- ruff has no project config and the tool is unpinned (`--with ruff` = latest), so the rule set is
  the version's default and can drift: 37 errors (F401 x11, C408 x9, RUF100 x7, I001 x3, B023 x2,
  four singletons).
- mypy `--strict`, on `kernel pipeline schemas`: 22 errors ([attr-defined] 10, [no-untyped-def] 3,
  [no-any-return] 3, [union-attr] 2, [type-arg] 2, [arg-type] 1, 1 other). Phases 1-3 predate this
  strictness. Nothing was fixed or relaxed; the job stays red on purpose until a decision is made.

## Not done

- PR #5 is a draft and unmerged, by instruction. The red `python-artifact` job is expected.
- Not run: any 2a/2b/2c/2d branch (out of scope); no real Supabase/GitHub/Resend/Vercel.
- Tools are unpinned; a pinned ruff/mypy and a config (or dev-dependency entries in the lock) would be
  needed before this becomes a gate.
