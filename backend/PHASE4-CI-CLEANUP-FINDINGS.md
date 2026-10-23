# Cleaning up and gating ruff / mypy in the `python-artifact` job

Branch `migration/python-pipeline-ci-v2` (PR #5, draft, not merged).
Evidence: run [39878582649](https://github.com/Geobatpo07/stories/actions/runs/39878582649)
(commit `eb49aa0`): `python-artifact` **success**, `verify` **success**, both with ruff and
mypy as ordinary, blocking steps. Raw "before" output: `evidence/phase-4-ci/`.

|                                                             | before          | after                 |
| ----------------------------------------------------------- | --------------- | --------------------- |
| ruff (unpinned latest = 0.17.2, its default rules)          | 37              | 0                     |
| ruff (0.17.2 pinned, rules written out in `pyproject.toml`) | 38              | 0                     |
| mypy --strict 2.4.0 (`kernel pipeline schemas`)             | 22              | 0                     |
| pytest                                                      | 817             | 820 (+3 tests, below) |
| Node reads Python-written artifact (vitest)                 | 457             | 457                   |
| `pnpm test` in `verify`                                     | 760 + 7 skipped | 760 + 7 skipped       |

`verify` (TypeScript) is **unchanged and green**: no TypeScript or workflow line of it was touched;
steps install, build:knowledge, typecheck, lint, test, build all success in the run above.

The ruff "before" differs by one (38 vs 37) because the written-out rule set is not ruff 0.17's
default: it adds B007 and C416 from the `B` and `C4` families and keeps the five default findings
that were not in your mechanical list as named rules. It is explicit on purpose, so red/green no
longer depends on the version of the day. Both ruff and mypy are dev dependencies pinned in
`uv.lock`; the CI steps are `uv run --frozen ruff check .` and `uv run --frozen mypy`.

## Commits, in order

1. `Pin ruff and write the ruff configuration out explicitly`
2. `ruff: mechanical fixes (F401, C408, I001, RUF100)`. 9 safe fixes (7 RUF100, 2 I001),
   C408 with the unsafe fix, and `__all__` in `schemas/__init__.py` for the 11 F401 (they are the
   package's public re-exports; deleting them would have broken `from schemas import ...`).
   Check: the 412 generated schema fixtures regenerate byte-identical (empty diff), pytest 817,
   Node round-trip 457, parity script OK.
3. `ruff: hand fixes for the remaining non-B023 findings`. RUF034, FURB188, C416, PYI034, B007,
   FURB167, PLC0206: no behaviour change; same checks.
4. `ruff B023: bind 'out' ...`
5. `mypy --strict: type annotations (no behaviour change)`
6. **`mypy --strict: narrowing guards that change behaviour on malformed input only`** (isolated)
7. `Pin mypy and write its strict configuration into pyproject`
8. `CI: ruff and mypy use the pinned versions ... and gate the python-artifact job`

## The two B023 (`tools/generate_schema_contract_fixtures.py`, `main()`)

```python
for kind, spec in SPECS.items():          # loop A (line 111)
    out: dict[str, dict] = {}             # rebound on every iteration
    ...
    def ok(name, desc, data, expected):   # closes over `out`        (B023, line 117)
        out[name] = {...}
    def bad(name, desc, data):            # closes over `out`        (B023, line 120)
        out[name] = {...}
    ok(...); bad(...)                     # ~50 calls, all inside the same iteration
    ...
    directory = ROOT / kind
    for name, body in out.items():        # `out` consumed, still the same iteration
        (directory / f"{name}.json").write_text(...)
```

**Both are benign** (it is one pair of closures, flagged twice). `ok` and `bad` are created and
called only inside the iteration that rebinds `out`; they are never stored, returned or called
after the loop, and `out` is written to disk before the next iteration. A stale capture would put
one kind's cases in another kind's directory; the 412 fixtures regenerate identically instead.
Fixed in form only, by binding the loop variable (`out=out` as a default argument). No negative
control was written: by construction there is no observable result to flip.

## mypy: each of the 22 errors, classified

Original list: `evidence/phase-4-ci/mypy-before.txt` is the state after the ruff work (12 errors);
the first 10 had already gone.

| Errors                                 | Where                                    | Class                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10 `attr-defined`                      | modules importing names from `schemas`   | **Fixed by the ruff commit**: `schemas/__init__.py` imported 11 names without exporting them; `__all__` is the real fix (found by mypy, applied for ruff). No runtime change. |
| `no-untyped-def` + `no-any-return` (2) | `schemas/common.py` `_match`, its caller | annotation: returns `Callable[[str], str]`                                                                                                                                    |
| `arg-type`                             | `kernel/errors.py` `_issues_for`         | annotation: parameter is pydantic's `ErrorDetails`, which was true all along; no knock-on errors inside the function                                                          |
| `no-untyped-def`                       | `markdown_parser._engine`                | annotation `Callable[[str], Any]`                                                                                                                                             |
| `no-any-return`                        | `markdown_parser.extract_slug`           | restructured to read the slug once (`data.get`), same result                                                                                                                  |
| `no-untyped-def`, `type-arg` (2)       | `duckdb_export.insert_rows`              | annotations (`DuckDBPyConnection`, `Sequence[tuple[str, str]]`, `Sequence[Sequence[Any]]`)                                                                                    |
| `type-arg`                             | `build.BuildResult.to_dict`              | `dict[str, Any]`                                                                                                                                                              |
| `no-any-return`                        | `manifest.platform_version`              | **guard** (commit 6)                                                                                                                                                          |
| 2 `union-attr`, 1 `arg-type`           | `GraphStore.query`                       | **guard** (commit 6)                                                                                                                                                          |

### Behaviour changes found (isolated in commit 6, each with a test that fails without it)

1. `GraphStore.query`: ladybug's `execute()` returns `QueryResult | list[QueryResult]`; a
   multi-statement script returns the list, and the old code died with
   `AttributeError: 'list' object has no attribute 'has_next'`. Now `TypeError: query() runs a
single Cypher statement`. `get_next()` is typed `list | dict`; a non-list row now raises
   instead of being appended. No caller passes either today (817 tests unchanged); this is a latent
   crash given a clear message, not a bug that changed any output.
2. `manifest.platform_version`: a non-string `package.json` version used to flow into the manifest;
   it now raises `TypeError`. Real files are unaffected.

No other fix changed a result: pytest, the Node round-trip, the parity script and the fixture
regeneration were re-run after every group of changes (outputs above).

## Not done / caveats

- Branch protection untouched; PR #5 not merged; no 2a/2b/2c/2d branch touched.
- The mypy scope is still `kernel pipeline schemas`, not `tests/` or `tools/`, as before.
- `verify` still skips 7 tests that need the Python venv; they run in `python-artifact`.
- The 10 `attr-defined` errors were removed by a ruff-driven change, not a mypy-driven one.
