# Reconciling the write-path lineage with the PR #5 ruff/mypy cleanup

Branch `migration/phase4-lint-reconcile`, based on `migration/phase4-write-relay` (`889e9b1`).
Not merged. Raw output: `evidence/phase-4-lint/`.

## What was carried over (steps 1 and 2)

Eight commits of `migration/python-pipeline-ci-v2` were cherry-picked (the docs commit was not):
pinned ruff 0.17.2 and mypy 2.4.0 in `uv.lock`, the explicit rule list, the mechanical and hand ruff
fixes, the B023 fix, the type annotations, the **two behaviour guards** (`GraphStore.query` refusing
a multi-statement script; `platform_version` refusing a non-string version) with their tests, the
strict mypy configuration and the blocking `ruff` + `mypy --strict` steps of `python-artifact`.
The diff was ported, not redone. Negative controls re-run on this branch (the two files put back to
their pre-guard state): `test_query_refuses_a_multi_statement_script_with_a_clear_error` and
`test_refuses_a_non_string_version` fail; they pass with the guards.

This branch already had its own `[tool.ruff]`/`[tool.mypy]` (select `E F I B UP ASYNC`, pydantic
plugin) for the Studio API port, so the configurations were **merged, not replaced**: the pinned list
plus `E`, `UP`, `ASYNC`, and the pydantic mypy plugin. Keeping `E` brings in E501 (line length),
which PR #5's list (`E4 E7 E9`) deliberately did not have; that is where most of the ruff work came
from. mypy's `files` grew from `kernel pipeline schemas` to the whole backend (`api auth authoring
kernel pipeline publication runtime schemas tests tools`).

Two things went wrong mid-way and were fixed, both mine: my conflict-resolution script left
conflict markers in `pyproject.toml` (rewritten by hand) and in `.github/workflows/ci.yml` (CRLF
file: the marker regex did not match); the latter was committed, so the workflow was invalid YAML
between `0c21e28` and the fix commit. `ci.yml` now parses and ends with the two steps.
`ruff --select RUF100 --fix` also removed two `# noqa: B017` because B017 was not selected in that
run; restored.

## Counts (the pinned config on the whole backend tree)

|               | before (`889e9b1` + pinned config)                                                                                                                              | after             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| ruff          | **76**: E501 70, RUF100 5, C416 1                                                                                                                               | **0**             |
| mypy --strict | **544** in 24 files: no-untyped-call 260, no-untyped-def 246, index 14, attr-defined 12, type-arg 4, union-attr 4, var-annotated 2, arg-type 1, no-any-return 1 | **0** in 95 files |

mypy by directory before: tests 447, tools 96, authoring 1; **0 in `api`, `auth`, `publication`,
`runtime`, `kernel`, `pipeline`, `schemas`**: the production code added since PR #5 was already
clean. (The "97 ruff / 569 mypy" in the brief were measured with a different config; these are the
numbers from the configuration that is now in the branch.)

## Findings that were not just annotations, one by one

None is a latent production bug; **no new negative control was needed**. Each, with its class:

- `authoring/definitions.py:156` `arg-type`: `_issues_for(cast(dict[str, Any], item))`. `item` is
  already pydantic's `ErrorDetails`; the cast was wrong, removed. No runtime effect (a cast is
  erased); the now-unused `cast` import went with it.
- `attr-defined` 12 and `index` 2 in `tools/generate_schema_contract_fixtures.py`: `SPECS` was
  inferred as `dict[str, dict[str, object]]`. Annotation. The 412 schema fixtures regenerate
  byte-identical (empty `git diff`).
- `index` 12 / `union-attr` 4 in tests (`fetchone()[0]`, `re.search(...).group(1)`): `None` was
  possible. Now an explicit `assert row is not None` / `assert match is not None` (helpers `scalar`
  in `tests/helpers.py`, `captured` in `test_artifact_contract.py`). Test-only: a missing row used to
  fail as `TypeError`, now as `AssertionError`.
- `type-arg` 4, `var-annotated` 2, `no-any-return` 1: annotations. `tests/api_support.py` assigns the
  response to a typed local before returning it (same value).
- `no-untyped-def` 246 + `no-untyped-call` 260: `-> None` on tests, typed parameters/returns on
  helpers (`Harness`, `httpx.Response`, ...), fixtures typed with `Path`/`pytest.MonkeyPatch`.
  The 260 calls disappeared by typing the helpers they called.
- **B023**: none on this tree (PR #5's two were fixed in the ported commit).
- ruff E501: `ruff format` on the 22 files with long lines (AST compared before/after: identical),
  then by hand: comments and docstrings wrapped (AST compared ignoring docstrings: identical),
  SQL/long literals split into adjacent literals (AST identical). Left alone on purpose:
  `tools/generate_kernel_contract_scenarios.py` (fixture documents as one-line literals) via a
  per-file E501 ignore, and 3 test names too long for 100 columns via `# noqa: E501`; renaming a test
  would change its identity.
- RUF100: removed three `noqa: BLE001`, one `S324`, one `C901` (rules not enabled); the explanation
  of the three `except Exception` is kept as a plain comment.
- One `PEP 695` generic (`def run[T]`) because UP047 asked for it.

## Existing tests (step 4)

|                               | before (`889e9b1`)     | after                 |
| ----------------------------- | ---------------------- | --------------------- |
| pytest                        | 1129 passed, 1 failed* | **1133 passed**       |
| vitest                        | 769 passed, 1 skipped  | 769 passed, 1 skipped |
| `pnpm typecheck`, `pnpm lint` | clean                  | clean                 |

*measured in a clean worktree without `node_modules`: `test_node_reader_opens_a_python_written_artifact`
needs the Node reader, an environment gap of the worktree, not a regression. The +4 are the three
tests ported from PR #5 (`test_manifest_version.py` x2, one in `test_graph_store.py`) plus that one.
No existing test changed result. The ported negative controls are the only deliberate additions.

## CI

`.github/workflows/ci.yml`, job `python-artifact`, last two steps (no `if:`), working directory
`backend`: `uv run --frozen ruff check .` and `uv run --frozen mypy`. Run on this branch: see the PR
below.

Real run (the branch itself, PR [#12](https://github.com/Geobatpo07/stories/pull/12), cannot get one:
it is `mergeable_state: dirty` against the current `main`, so GitHub starts no run; conflicts in
`app/api/auth/login/route.ts` and a comment wrap in `backend/kernel/pipeline/factory.py`).
So a throwaway probe branch `ci-probe/phase4-lint-reconcile` = this branch + a merge of `main`
(PR [#13](https://github.com/Geobatpo07/stories/pull/13), draft, not to be merged) was used:

- Run [39890883737](https://github.com/Geobatpo07/stories/actions/runs/39890883737): `python-artifact`
  **success** with `ruff` and `mypy --strict` as success steps; `verify` **failure** in `pnpm test`:
  `app/api/auth/login/route.test.ts`, 12 tests of `main`'s TypeScript rate-limit suite (PR #4).
  The merge brings that file back; the relay removed the TypeScript limiter, so those tests have
  nothing to test. Not a regression of this branch; **a merge-time decision**: when this lineage
  goes to `main`, that suite is deleted (the limiter's tests live in `backend/tests/test_api_login.py`).
- Run [39891084444](https://github.com/Geobatpo07/stories/actions/runs/39891084444) (probe with that
  file deleted): `python-artifact` **success** (ruff, mypy --strict success), `verify` **success**
  (`pnpm test` success).
- Conflict resolution in the probe: `login/route.ts` = the relay, `factory.py` = this branch's wrapped
  comment. The same two resolutions will be needed on a real merge.

## Not done

- `ruff format --check` is not gated and 5 files would still be reformatted; only lint is gated.
- Other branches, the PR #5 branch and #7 to #11 untouched. Nothing merged.
- `fixtures/kernel-contract/**/expected.json` are deleted by running the Python scenario generator
  (the TypeScript kernel writes them); I restored them with `git checkout`, as before.
