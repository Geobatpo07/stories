# Phase 2 (Kernel port): findings

Same branch as Phase 1 (`migration/phase1-schema-contract`), nothing committed. Nothing under `kernel/`, `build/`, `runtime/`, `authoring/`, `auth/`, `schemas/` or `domain/` was modified. The only existing-file change is inside my own Phase 1 work: `backend/schemas/common.py` (see below).

## Scope

Ported, as ADR-004 Phase 2 asks: discovery, frontmatter parsing, validation, normalization, the domain factory, and the closed-world relationship resolution (kept as a pure validation pass that stores nothing; the LadybugDB edges are Phase 3).

Not ported, deliberately:

- `graph.ts` (Phase 3).
- `api.ts`, `cache.ts` and `authoring.ts` (the public query API, memoization and authoring helpers; service-layer concerns for Phase 4).
- `KnowledgeNotFoundError` exists, but nothing raises it yet.

## Layout (mirrors `kernel/` one-to-one)

`backend/kernel/`: `errors.py`, `types.py`, `registry/{types,registrations}.py`, `parsers/{parser,markdown_parser}.py`, `pipeline/{discovery,parsing,validation,normalization,factory,relationships}.py`, `loaders/load_all.py`.

`load_all(root)` takes the repo root explicitly. The TS version uses `process.cwd()` and memoizes, and neither carries over.

New dependency: `ruamel.yaml` (YAML 1.2). `PyYAML` is YAML 1.1 and turns `yes`/`no`/`on`/`off` into booleans, which js-yaml 3 behind `gray-matter` does not.

## How parity is proven

The reference is the real TypeScript Kernel. Its output is committed as golden files, and both languages assert against them.

- **Scenarios:** `fixtures/kernel-contract/scenarios/<name>/content/<collection>/...` is 21 miniature repo roots, written by `backend/tools/generate_kernel_contract_scenarios.py`. They cover:
  - a happy path covering all 9 kinds;
  - an empty lab;
  - duplicate slugs;
  - YAML quirks;
  - frontmatter edge cases: BOM, no closing delimiter, `---json`, comments, `----`, JS-vs-Python whitespace trimming;
  - failures: validation (many issues), unquoted YAML date, malformed YAML, scalar/list/null/comment-only frontmatter, unknown language, duplicate key, dangling one/many reference, wrong target kind, missing collection directory.
- **TS side:** `fixtures/kernel-contract/kernel-contract.test.ts` runs the real stage functions (`discoverSourceFiles`, `parseSource`, `validateFrontmatter`, `normalizeFrontmatter`, `createEntity`, `resolveRelationships`, with the real `registrations`), rooted at each scenario. It asserts equality with `expected.json`. `UPDATE_GOLDEN=1` regenerates the goldens from TS only.
- **Python side:** `backend/tests/test_kernel_contract.py` runs `load_all` on the same scenarios and compares entities, error classes, file paths, and `{path, message, hint}` issues.
- **Validation issues:** every one of the ~300 invalid Phase 1 fixtures is also run through TS's `KnowledgeValidationError`. Its `{path, message, hint}` issues are the golden (`validation-issues.json`), and Python's rebuilt issues must equal it, including the exact Zod wording ("Required", "String must contain at least 1 character(s)", "Invalid enum value. Expected 'draft' | ...").

**Result:** pytest **756 passed** (413 Phase 1 + 343 Phase 2). Vitest kernel contract **22 passed** (21 scenarios + the issue-contract test). Both consume the same files.

## What did not port mechanically

1. **Zod issue text.** Pydantic's errors are different in shape and wording, so `kernel/errors.py` rebuilds Zod's issues from Pydantic's error types. The table covers exactly the error types these nine schemas can produce, and an unmapped type raises `NotImplementedError` instead of silently printing different text. The mapping is why the golden comparison matters. If a schema gains a new constraint kind (a number range, say), the mapping and a fixture need extending.
2. **Empty slug yields two Zod issues** (`min(1)` and the regex both run). Pydantic stops at the first failure, so the Phase 1 `Slug` type now raises a custom `slug_empty` error that the Kernel layer expands back into both. Accept/reject behavior is unchanged, and the Phase 1 tests still pass. The error type is `format` for regex/URL failures (carries Zod's message text).
3. **`gray-matter` has quirks that no Python library reproduces.** `split_frontmatter` mirrors its algorithm step by step:
   - a BOM is stripped;
   - `----` at the top is not a delimiter;
   - text after the opening `---` is a language selector, and an unknown one is an error;
   - the closing delimiter is the first `\n---` anywhere (so a `----` line also closes the block);
   - with no closing delimiter the whole remainder is frontmatter and the body is empty;
   - comment-only frontmatter is `{}`;
   - **a YAML `null` result (`~`, `null`) becomes `{}`**. I missed that one at first, and the golden caught it: `err-frontmatter-null` failed until I added it. It comes from gray-matter's `excerpt()` step;
   - other falsy scalars (`0`, `""`, `false`) stay as they are and fail validation as "Expected object, received …".
4. **`trim()` whitespace.** JS and Python disagree: U+FEFF is trimmed by JS only, and U+0085 and U+001F by Python only. The port uses the ECMAScript whitespace set. Two scenarios lock both directions.
5. **Tag sort order.** JS sorts by UTF-16 code units and Python by code points, which differ outside the BMP. The port sorts on UTF-16 bytes. The golden's tags include an astral emoji and U+FB01 to prove it.
6. **YAML dates.** An unquoted `date: 2026-03-01` becomes a `Date` in js-yaml and a `datetime.date` in ruamel. Both are rejected by the schema with the same issue ("Expected string, received date"). This is the footgun I flagged in Phase 1, now pinned by a scenario.
7. **`file_path`.** TS stores `join(contentDir, file)`, so on Windows it is `content\programs\x.mdx`. Python always stores the root-relative, `/`-separated form (`content/programs/x.mdx`). The TS golden is normalized to `/` for comparison. This is a deliberate cross-platform improvement. The value is hashed nowhere (content hash strips it), but Phase 3 should keep `file_path` on the Python form.
8. **Directory order.** TS uses `readdirSync` order (NTFS order on Windows, sorted on Linux through libuv). Python sorts by name. Scenario filenames are lowercase, so they agree. A kernel output that depends on directory order should not exist; Phase 3's export should sort explicitly.
9. **Unsupported `gray-matter` engines.** `---js` (which evals) and `---coffee` raise a parse error in Python. Nothing in the repo uses them.
10. **No memoization**, as noted above.

## Relationship resolution

- The Kernel's relationship fields come from the **explicit registry** (`relationshipFields` per registration), not from field-name conventions. So the `relatedQuestionSlugs` naming deviation I flagged in Phase 1 does not matter for the port. The Python registry copies the same specs, in the same order, and relationship order inside an entity follows that order (the `ok-full` golden checks this for experiment and presentation).
- The closed-world behavior is kept: a dangling slug raises `KnowledgeRelationshipError` with the same message. A slug that exists but under a **different kind** also dangles (`err-wrong-target-kind`).
- **Duplicate ids are still not rejected by the Kernel**, in either language. The id map keeps the last entity silently, and both entities are returned (`ok-duplicate-slug`). `build/`'s duplicate-id check is what catches it, so Phase 3's pipeline must keep that check.

## Not done

- Nothing was committed, as before.
- I did not run the full `pnpm test`, lint or typecheck, only the two contract suites.
- No performance measurement. The scenarios are tiny.
- The Phase 1 carry-overs are still open: the `duckdb` pin and CI skew check, the two-table vs four-table decision, and the bare `build` rule in `.gitignore`.

## Reproduce

```
python backend/tools/generate_kernel_contract_scenarios.py       # inputs
UPDATE_GOLDEN=1 npx vitest run fixtures/kernel-contract            # goldens, from the TS Kernel
npx vitest run fixtures/kernel-contract                            # TS side
cd backend && .venv/Scripts/python.exe -m pytest                   # Python side (756 tests)
```

---

## Addendum, 2026-10-22

Two statements in "Not done" are wrong: the "bare `build` rule in `.gitignore`" does not exist on `origin/main` (it came from reading a stale local checkout), and the "two-table vs four-table decision" is moot because the shipped artifact has two tables. See `RECONCILIATION-FINDINGS.md`, items 2 and 7. The Kernel contract tests were re-run unchanged in a clean checkout of `origin/main` and pass.
