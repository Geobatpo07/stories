# Phase 1 (schema contract): findings

Branch `migration/phase1-schema-contract`, cut from `main` after `git fetch` and a fast-forward to `origin/main` (`48c2145`). Local `main` had been 16 commits behind. That is the "local discrepancy" from the spike: `build/targets/round-trip.test.ts` now exists locally, as ADR-004 said.

Nothing under `kernel/`, `build/`, `runtime/`, `authoring/`, `auth/`, `schemas/` or `domain/` was touched.

## What was added

- `backend/pyproject.toml` (Python >= 3.12, Pydantic v2, pytest as a dev dependency).
- `backend/schemas/`: `common.py`, `content_status.py`, `content_type.py`, `frontmatter.py`, and one module per domain kind. The names mirror the TS layout (`dataset`, `experiment`, `hypothesis`, `knowledge`, `presentation`, `program`, `publication`, `question`, `software`).
- `fixtures/schema-contract/<kind>/*.json`: 412 shared fixtures, plus `vocabulary.json`.
- `backend/tools/generate_schema_contract_fixtures.py`: writes the fixtures. Expected outcomes are declared by hand in it from the Zod source. They are never produced by running either validator.
- `fixtures/schema-contract/schema-contract.test.ts` (Vitest, imports the real `domain/*/schema.ts`) and `backend/tests/test_schema_contract.py` (pytest, imports the Pydantic ports).

Each fixture carries `valid` and, for valid ones, an `expected` normalized output. Both tests assert against that single declaration, not against each other.

## Result

- pytest: **413 passed**.
- Vitest: **421 passed**. That is 412 fixtures plus per-kind sanity tests, plus the vocabulary test.
- Every fixture gives the same accept/reject outcome and the same normalized output on both sides.
- Vocabulary parity: `contentStatus`, `contentType` (9 kinds) and `knowledgeObjectType` match Zod's `.options` exactly, in the same order.
- Sensitivity check:
  - Reverting the regex handling in `common.py` (`match` instead of `fullmatch`, dropping `re.ASCII`) made 9 fixtures fail.
  - Flipping `extra="ignore"` to `"forbid"` made 9 fixtures fail.
  - Both changes were reverted afterwards.
  - So the suite catches these specific drifts. I did not mutation-test every field.

## Fields that did not port mechanically

1. **Regexes.** The patterns are copied verbatim, but the same text behaves differently in Python and JS.
   - `$` in Python also matches before a trailing `\n`, so `"a-b\n"` would pass.
   - `\d` in Python matches any Unicode digit, so `"2026-10-٢٢"` would pass.
   - I use `re.fullmatch` and `re.ASCII`.
   - Pydantic's own `pattern=` constraint uses Rust regex, where `\d` is also Unicode, so I deliberately do not use it. The `invalid-*-trailing-newline` and `invalid-date-unicode-digits` fixtures lock this.
2. **`z.string().url()`.**
   - Zod 3.25 runs `new URL(value)` and returns the original string.
   - I validate with Pydantic's `AnyUrl` (the Rust `url` crate, also WHATWG-based) in strict mode and return the original string, not the normalized `AnyUrl`. Otherwise `HTTPS://Example.ORG` would come back as `https://example.org/`.
   - I compared 23 URL strings in both engines beforehand and they agreed everywhere, including the lenient cases (`a:b`, `https:/x.com`, `http:///a`) and the rejects. Both engines hold the same WHATWG rules, but this is a spot check, not a proof. Parser updates on either side could diverge.
3. **`.optional()` rejects explicit `null`.** The idiomatic Pydantic `T | None = None` would accept it.
   - The ports declare `Slug = None` and similar, which Pydantic does not validate when the key is missing but does validate when `None` is passed explicitly.
   - Output is dumped with `exclude_none=True` so missing optionals are absent, as in Zod.
   - This needs `# type: ignore[assignment]` on those fields and is the least pretty part of the port.
   - It is safe because no valid value is `None`.
4. **`.default()` only fires on `undefined`.** `status: null` and `tags: null` are rejected by Zod, and by the ports too. Both have fixtures.
5. **No coercion.** Zod's `z.string()` never coerces, so the models use `strict=True` (a number for `title`, `date` or a slug is rejected).
6. **Dates are only shape-checked.** `2026-13-45` is valid in Zod and in the port (`valid-impossible-date-matches-regex` pins it). This is a pre-existing looseness, ported faithfully, not fixed. Fixing it would be a deliberate behavior change for later.
7. **Length semantics.** `min(1)` counts UTF-16 units in JS and code points in Python. Both only matter at zero, so they agree for every string that matters here.

Not a schema difference, but relevant to Phase 2: `gray-matter` can turn an unquoted YAML date into a JS `Date`, which Zod's `isoDateSchema` rejects and Pydantic strict mode would also reject. Phase 2's frontmatter parser has to decide how it handles that, whatever the schema says.

## Unknown-field handling

- I checked all nine domain schemas and the base schema. All are plain `baseFrontmatterSchema.extend({...})`, and none uses `.strict()`, `.passthrough()` or `.catchall()`.
- Zod's default for `z.object` is **strip**: unknown keys are silently dropped from the parsed output and never cause an error.
- Every Pydantic model therefore sets `extra="ignore"` explicitly, inherited from `BaseFrontmatter`. It does not rely on Pydantic's default.
- `valid-unknown-field-stripped` exists for every kind. It asserts acceptance and that the unknown keys are absent from the output.
- The kernel's factory re-attaches non-base frontmatter fields to the entity ("extra fields" in `build/duckdb/extra-fields.ts`). That happens after schema parsing, on the raw frontmatter, so it is a Phase 2 concern and not affected here.

## Relationship field naming

The convention `<kind>Slug` (cardinality one) and `<kind>Slugs` (many) is **not fully uniform** across the nine schemas. Eight of nine are consistent with it.

| Schema                         | Relationship fields                                              | Fits convention?                                                                            |
| ------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| question                       | `programSlug` (one, required)                                    | yes                                                                                         |
| hypothesis                     | `questionSlug` (one, required)                                   | yes                                                                                         |
| experiment                     | `questionSlug` (one, required), `hypothesisSlug` (one, optional) | yes                                                                                         |
| knowledge (`note`)             | `programSlug` (one, optional)                                    | yes                                                                                         |
| presentation                   | `programSlug`, `questionSlug` (one, optional)                    | yes                                                                                         |
| program                        | `relatedQuestionSlugs` (many, default `[]`)                      | **no: the plural carries a `related` prefix** (`relatedQuestionSlugs`, not `questionSlugs`) |
| dataset, software, publication | none                                                             | n/a                                                                                         |

Other points:

- Only `program` has a `many` field.
- `sourceUrl`, `slidesUrl`, `videoUrl`, `repositoryUrl` and `preprintUrl` are URLs, not relationships.
- The ports keep the exact TS field names (camelCase), since these names are the frontmatter keys. A Phase 2 relationship resolver that derives the target kind from the field name (strip `Slug(s)`) would break on `relatedQuestionSlugs`. That is worth checking against `kernel/pipeline/relationships.ts` when Phase 2 starts. I did not read it, to stay in scope.

## Not done, deliberately

- The CI step ADR-004 asks for (write with the pinned Python `duckdb`, read with the pinned `@duckdb/node-api`) and the explicit `duckdb` pin. That is Phase 3, and the task only listed schema work. Nothing in `backend/` depends on `duckdb` yet.
- The two-table vs four-table decision for the artifact contract.
- `pnpm test` now includes the Vitest contract file (421 tests), since `vitest.config.ts` globs `**/*.test.ts`. That is intended. I did not run lint or typecheck on it.
- The root `.gitignore` has a bare `build` rule. It matches `build/` anywhere, which is why many new files under `build/` show as untracked on this checkout. I did not change it. It is unrelated to Phase 1 but will bite Phase 3.

## Reproduce

```
cd backend && uv sync && .venv/Scripts/python.exe -m pytest      # Pydantic side
cd .. && npx vitest run fixtures/schema-contract                   # Zod side
python backend/tools/generate_schema_contract_fixtures.py          # regenerate fixtures
```

---

## Addendum, 2026-10-22 (written during the Phase 2.5 reconciliation)

The text above is left as originally written. These corrections apply to it:

1. **`Slug` changed during Phase 2.** The "Fields that did not port mechanically" section describes `Slug` as `StringConstraints(min_length=1)` plus a regex check. That is no longer what `backend/schemas/common.py` contains. Zod's `.min(1).regex()` runs both checks, so `""` yields two issues (`too_small`, then the regex). Pydantic stops at the first failing constraint and gave only one. `Slug` is now a single `AfterValidator` (`_slug`): an empty string raises a custom `slug_empty` error, and any other regex failure raises a `format` error carrying the Zod message. `backend/kernel/errors.py` expands `slug_empty` back into the two Zod issues. Accept/reject behavior is unchanged, and the Phase 1 fixtures still pass. `Url` and `IsoDate` now raise the same `format` error type instead of a bare `ValueError`.
2. **Fixture and test counts.** The text says "412 shared fixtures". There are **411** fixture files. The generator's "wrote 412" counted `vocabulary.json` as well. The test counts reconcile as follows: pytest 413 = 411 fixture-driven + 2 structural (vocabulary, every domain directory has a model). Vitest 421 = 411 fixture-driven + 1 vocabulary test + 9 per-kind "has fixtures covering both outcomes" tests. That per-kind test only asserted more than 10 files existed; it now asserts that at least one valid and one invalid fixture exist per kind (and an equivalent pytest was added, so pytest is now 422 for this file).
3. **"The root `.gitignore` has a bare `build` rule" (under "Not done, deliberately") was wrong.** I read the root `.gitignore` on a stale local `main` (`e297e27`) that still had it. Current `origin/main` removed it in `1b84f98`. See `RECONCILIATION-FINDINGS.md`, item 2.
4. The Phase 1 "relationship field naming" table is unaffected, but its follow-up worry (a resolver that strips `Slug(s)` from field names) does not apply: the Kernel resolves relationships from the explicit registry (see `PHASE2-FINDINGS.md`).
