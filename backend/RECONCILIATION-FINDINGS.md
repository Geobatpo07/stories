# Phase 2.5 reconciliation findings

Branch `migration/phase-2.5-reconciliation`, cut from a freshly fetched `origin/main` (`48c2145`). Nothing committed. Every claim below has the raw command output under it. Full logs are in `backend/evidence/phase-2.5/` (the file name is given with each block).

**Headline.** Item 2 (and then item 7.3) turned up something bigger than a stray `.gitignore` line: my Phase 0 to Phase 2 notes about `build/` were based on a stale local checkout whose `build/` was never committed. The shipped `build/` on `origin/main` is a different, smaller pipeline. This changes several statements in the earlier findings and in ADR-004 (see item 7). Items 1, 3, 4, 5 and 6 came out as described, with the exceptions stated in each item.

Ordering note: verification (item 6) was run in a clean worktree of `origin/main` plus only my new files, because the main checkout carries 39 stale untracked `build/` files that break `tsc` and `vitest` (item 6 shows both runs).

---

## 1. Phase 1 test counts

Commands (full logs: `pytest-phase1-verbose.txt`, `vitest-phase1-verbose.txt`):

```
$ pytest -v tests/test_schema_contract.py      -> 422 passed   (was 413 before this pass)
$ vitest run fixtures/schema-contract --reporter=verbose -> 421 passed
$ find fixtures/schema-contract -name "*.json" ! -name vocabulary.json | wc -l -> 411
```

**The "412" was wrong, the suites were not.** The generator printed "wrote 412 fixtures", which included `vocabulary.json`. There are **411** fixture files.

Per-kind fixture counts (`ls fixtures/schema-contract/<kind> | wc -l`):

```
dataset 43
experiment 45
hypothesis 40
knowledge 50
presentation 59
program 44
publication 47
question 40
software 43
total 411
```

Tests that are not one-per-fixture, by name. Pytest (`grep PASSED ... | grep -v "test_fixture\["`):

```
tests/test_schema_contract.py::test_vocabulary_matches_zod_enums_in_order PASSED
tests/test_schema_contract.py::test_every_domain_directory_has_a_model PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[dataset] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[experiment] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[hypothesis] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[knowledge] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[presentation] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[program] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[publication] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[question] PASSED
tests/test_schema_contract.py::test_kind_has_fixtures_covering_both_outcomes[software] PASSED
```

Vitest (`grep "✓" ... | grep -v ".json"`):

```
 ✓ fixtures/schema-contract/schema-contract.test.ts > vocabulary > matches the Zod enums, in order
 ✓ fixtures/schema-contract/schema-contract.test.ts > dataset schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > experiment schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > hypothesis schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > knowledge schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > presentation schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > program schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > publication schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > question schema contract > has fixtures covering both outcomes
 ✓ fixtures/schema-contract/schema-contract.test.ts > software schema contract > has fixtures covering both outcomes
```

Arithmetic: Zod side 411 fixture-driven + 1 vocabulary + 9 "has fixtures covering both outcomes" = **421**. Pydantic side (before) 411 + 2 structural (vocabulary, every directory has a model) = **413**.

**A real gap, now fixed.** The nine Vitest "has fixtures covering both outcomes" tests only asserted `files.length > 10`, which does not check what the name says. I changed them to assert that at least one valid and one invalid fixture exist per kind, and added the equivalent pytest (`test_kind_has_fixtures_covering_both_outcomes[<kind>]`, nine cases, visible in the list above). That is why pytest went from 413 to 422 while Vitest stayed at 421. Nothing else is unaccounted for.

---

## 2. The `.gitignore` with a bare `build` rule

Full output: `gitignore-evidence.txt`. Key parts:

```
$ find . -name ".gitignore" -not -path "*/node_modules/*"
./.gitignore
./.husky/_/.gitignore
./backend/.gitignore
./backend/.pytest_cache/.gitignore
./backend/.venv/.gitignore
./spikes/ladybugdb-phase0/.gitignore
./spikes/ladybugdb-phase0/.venv/.gitignore

$ cat .gitignore
# dependencies
node_modules
.pnpm-store

# next.js — Next.js never emits into build/ or dist/; those names are reserved for
# the Knowledge Artifact Pipeline (build/, tracked source) and are deliberately not
# ignored here.
.next
out

# duckdb — generated analytical index, never a source of truth
*.duckdb
*.duckdb.wal
*.wal
database/generated/*
!database/generated/.gitkeep

# env
.env
.env.local
.env.*.local

# studio auth — password hash, sessions, reset tokens. Never Git-tracked,
# unlike knowledge/ (see auth/server.ts and auth/README.md).
.studio-auth/

# typescript
*.tsbuildinfo
next-env.d.ts

# misc
.DS_Store
*.pem
npm-debug.log*
pnpm-debug.log*
yarn-debug.log*
yarn-error.log*

# editor
.vscode/*
!.vscode/extensions.json
.idea

$ cat backend/.gitignore
.venv/
__pycache__/
.pytest_cache/

$ cat spikes/ladybugdb-phase0/.gitignore
.venv/
out/
__pycache__/
```

**There is no bare `build` rule in any current `.gitignore`.** The root `.gitignore` says build/ is deliberately not ignored, `backend/.gitignore` has three Python lines, and the spike's has three. `git check-ignore` returns "not ignored" for every real `build/` path and for `backend/build/x.whl`:

```
build/pipeline.ts -> (not ignored, exit 1)
build/duckdb/connect.ts -> (not ignored, exit 1)
build/targets/duckdb-target.ts -> (not ignored, exit 1)
build/targets/round-trip.test.ts -> (not ignored, exit 1)
backend/build/x.whl -> (not ignored, exit 1)
backend/schemas/common.py -> (not ignored, exit 1)
backend/.venv/pyvenv.cfg -> backend/.gitignore:1:.venv/	backend/.venv/pyvenv.cfg
```

**So my Phase 1 claim ("the root `.gitignore` has a bare `build` rule") was wrong, and so was the premise it rested on.** Where it came from:

```
$ git show e297e27:.gitignore | sed -n 1,14p   (stale local main read in Phases 0-1)
# dependencies
node_modules
.pnpm-store

# next.js
.next
out

# production
build
dist

# duckdb — generated analytical index, never a source of truth
*.duckdb

$ git show 1b84f98 -- .gitignore
commit 1b84f982b1e7d2a1c2f4a251e11591deab47112f
Author: Geobatpo07 <lgeobatpo98@gmail.com>
Date:   Sat Aug 15 06:14:25 2026 +0200

    Add the Knowledge Artifact Pipeline and fix the .gitignore collision that erased it

    .gitignore's generic `build`/`dist` rule (leftover boilerplate for a
    non-Next output directory) was silently swallowing build/, the actual
    source directory for the Knowledge Artifact Pipeline described throughout
    the architecture docs — it had never once been committed, breaking
    `pnpm build:knowledge` and typecheck (authoring/workflow.ts already
    imports from @/build). Reconstructed the pipeline to the exact contract
    already fixed by its one reader, runtime/adapters/artifact-knowledge-source-adapter.ts,
    and locked that contract with a round-trip test.

    Also restores the nine content/<collection>/ directories (as empty,
    .gitkeep-only folders): the "empty laboratory" commit deleted their sole
    placeholder file each, and since nothing else tracked the directories,
    Git dropped them entirely — breaking the Kernel's directory scan the same
    way, independent of the build/ issue.

diff --git a/.gitignore b/.gitignore
index 31108a1..9f4e91f 100644
--- a/.gitignore
+++ b/.gitignore
@@ -2,14 +2,12 @@
 node_modules
 .pnpm-store

-# next.js
+# next.js — Next.js never emits into build/ or dist/; those names are reserved for
+# the Knowledge Artifact Pipeline (build/, tracked source) and are deliberately not
+# ignored here.
 .next
 out

-# production
-build
-dist
-
 # duckdb — generated analytical index, never a source of truth
 *.duckdb
 *.duckdb.wal
@@ -22,6 +20,10 @@ database/generated/*
 .env.local
 .env.*.local

+# studio auth — password hash, sessions, reset tokens. Never Git-tracked,
+# unlike knowledge/ (see auth/server.ts and auth/README.md).
+.studio-auth/
+
 # typescript
 *.tsbuildinfo
 next-env.d.ts
```

Local `main` was at `e297e27`, 16 commits behind `origin/main`. On `e297e27` the root `.gitignore` had the bare `build` / `dist` rule. I fast-forwarded at the start of Phase 1, which removed the rule, but I had already read the files in `build/` before that. Because the old rule had hidden `build/`, the working directory was left holding files that no commit contains. `1b84f98` ("fix the .gitignore collision that erased it") is the commit that removed the rule and committed a reconstructed pipeline.

Tracked vs untracked under `build/` on this branch:

```
$ git ls-files build | wc -l ; git ls-files --others --exclude-standard build | wc -l
20
39

$ git ls-files build
build/README.md
build/cli.ts
build/duckdb/connect.ts
build/index.ts
build/pipeline.chain.test.ts
build/pipeline.kernel-failure.test.ts
build/pipeline.test.ts
build/pipeline.ts
build/report.test.ts
build/report.ts
build/targets/duckdb-target.test.ts
build/targets/duckdb-target.ts
build/targets/manifest-target.test.ts
build/targets/manifest-target.ts
build/targets/registry.test.ts
build/targets/registry.ts
build/targets/round-trip.test.ts
build/targets/types.ts
build/types.ts
build/version.ts

$ git ls-files --others --exclude-standard build   (untracked, stale local files)
build/duckdb/extra-fields.test.ts
build/duckdb/extra-fields.ts
build/duckdb/populate.test.ts
build/duckdb/populate.ts
build/duckdb/schema.ts
build/errors.test.ts
build/errors.ts
build/hash/canonical-json.test.ts
build/hash/canonical-json.ts
build/hash/checksum.test.ts
build/hash/checksum.ts
build/hash/content-hash.test.ts
build/hash/content-hash.ts
build/manifest/build-manifest.test.ts
build/manifest/build-manifest.ts
build/manifest/types.ts
build/pipeline/checks/broken-references.test.ts
build/pipeline/checks/broken-references.ts
build/pipeline/checks/circular-dependencies.test.ts
build/pipeline/checks/circular-dependencies.ts
build/pipeline/checks/duplicate-ids.test.ts
build/pipeline/checks/duplicate-ids.ts
build/pipeline/checks/duplicate-slugs.test.ts
build/pipeline/checks/duplicate-slugs.ts
build/pipeline/checks/missing-metadata.test.ts
build/pipeline/checks/missing-metadata.ts
build/pipeline/load.test.ts
build/pipeline/load.ts
build/pipeline/orchestrator.test.ts
build/pipeline/orchestrator.ts
build/pipeline/report.test.ts
build/pipeline/report.ts
build/pipeline/types.ts
build/pipeline/validate-artifacts.test.ts
build/pipeline/validate-artifacts.ts
build/pipeline/validate-graph.test.ts
build/pipeline/validate-graph.ts
build/targets/registrations.ts
build/version.test.ts
```

Twenty files are tracked. Thirty-nine are untracked leftovers from the older local checkout (`build/duckdb/schema.ts`, `build/hash/*`, `build/manifest/*`, `build/pipeline/*`, ...). I did **not** delete or move them (they are your files), but they are stale and break `tsc` and `vitest` in this checkout (item 6). Recommended: move them out of the repo.

Nothing needs fixing in `.gitignore`. The `*.duckdb` rule correctly ignores `spikes/.../out/knowledge.duckdb` and `database/generated/*`.

---

## 3. Validation messages, TS vs Python, verbatim

Method: a throwaway Vitest test (since deleted) ran the real `validateFrontmatter` / `KnowledgeValidationError` and real `resolveRelationships` on seven real invalid fixtures, one multi-issue file through the real `MarkdownParser`, and a dangling relationship, and wrote JSON. A Python script (`python -I`) ran the same inputs through the port. It compares every `path`, `message`, `hint` and the full error message string. Full output, nothing elided (`validation-side-by-side.txt`):

```

```

### program/invalid-missing-theme — IDENTICAL

issue[0].path
TS: 'theme'
PY: 'theme'
issue[0].message
TS: 'Required'
PY: 'Required'
issue[0].hint
TS: 'this field is required'
PY: 'this field is required'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - theme: Required (this field is required)
full message (PY):
| Invalid frontmatter in "f.mdx":
| - theme: Required (this field is required)

### question/invalid-slug-casing — IDENTICAL

issue[0].path
TS: 'slug'
PY: 'slug'
issue[0].message
TS: 'Slug must be lowercase kebab-case (e.g. cyclone-modeling)'
PY: 'Slug must be lowercase kebab-case (e.g. cyclone-modeling)'
issue[0].hint
TS: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
PY: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - slug: Slug must be lowercase kebab-case (e.g. cyclone-modeling) (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
full message (PY):
| Invalid frontmatter in "f.mdx":
| - slug: Slug must be lowercase kebab-case (e.g. cyclone-modeling) (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))

### dataset/invalid-date-format — IDENTICAL

issue[0].path
TS: 'date'
PY: 'date'
issue[0].message
TS: 'Date must be in YYYY-MM-DD format'
PY: 'Date must be in YYYY-MM-DD format'
issue[0].hint
TS: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
PY: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - date: Date must be in YYYY-MM-DD format (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
full message (PY):
| Invalid frontmatter in "f.mdx":
| - date: Date must be in YYYY-MM-DD format (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))

### knowledge/invalid-noteType-unknown — IDENTICAL

issue[0].path
TS: 'noteType'
PY: 'noteType'
issue[0].message
TS: "Invalid enum value. Expected 'research-note' | 'development-log' | 'reading-note' | 'tutorial' | 'conference-note' | 'book-review' | 'essay', received 'blog'"
PY: "Invalid enum value. Expected 'research-note' | 'development-log' | 'reading-note' | 'tutorial' | 'conference-note' | 'book-review' | 'essay', received 'blog'"
issue[0].hint
TS: 'must be one of: research-note, development-log, reading-note, tutorial, conference-note, book-review, essay'
PY: 'must be one of: research-note, development-log, reading-note, tutorial, conference-note, book-review, essay'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - noteType: Invalid enum value. Expected 'research-note' | 'development-log' | 'reading-note' | 'tutorial' | 'conference-note' | 'book-review' | 'essay', received 'blog' (must be one of: research-note, development-log, reading-note, tutorial, conference-note, book-review, essay)
full message (PY):
| Invalid frontmatter in "f.mdx":
| - noteType: Invalid enum value. Expected 'research-note' | 'development-log' | 'reading-note' | 'tutorial' | 'conference-note' | 'book-review' | 'essay', received 'blog' (must be one of: research-note, development-log, reading-note, tutorial, conference-note, book-review, essay)

### hypothesis/invalid-rel-questionSlug-empty — IDENTICAL

issue[0].path
TS: 'questionSlug'
PY: 'questionSlug'
issue[0].message
TS: 'String must contain at least 1 character(s)'
PY: 'String must contain at least 1 character(s)'
issue[0].hint
TS: 'must be at least 1 character(s)'
PY: 'must be at least 1 character(s)'
issue[1].path
TS: 'questionSlug'
PY: 'questionSlug'
issue[1].message
TS: 'Slug must be lowercase kebab-case (e.g. cyclone-modeling)'
PY: 'Slug must be lowercase kebab-case (e.g. cyclone-modeling)'
issue[1].hint
TS: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
PY: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - questionSlug: String must contain at least 1 character(s) (must be at least 1 character(s))
| - questionSlug: Slug must be lowercase kebab-case (e.g. cyclone-modeling) (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
full message (PY):
| Invalid frontmatter in "f.mdx":
| - questionSlug: String must contain at least 1 character(s) (must be at least 1 character(s))
| - questionSlug: Slug must be lowercase kebab-case (e.g. cyclone-modeling) (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))

### presentation/invalid-url-slidesUrl — IDENTICAL

issue[0].path
TS: 'slidesUrl'
PY: 'slidesUrl'
issue[0].message
TS: 'Invalid url'
PY: 'Invalid url'
issue[0].hint
TS: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
PY: 'check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - slidesUrl: Invalid url (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
full message (PY):
| Invalid frontmatter in "f.mdx":
| - slidesUrl: Invalid url (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))

### program/invalid-status — IDENTICAL

issue[0].path
TS: 'status'
PY: 'status'
issue[0].message
TS: "Invalid enum value. Expected 'draft' | 'active' | 'paused' | 'concluded', received 'published'"
PY: "Invalid enum value. Expected 'draft' | 'active' | 'paused' | 'concluded', received 'published'"
issue[0].hint
TS: 'must be one of: draft, active, paused, concluded'
PY: 'must be one of: draft, active, paused, concluded'
full message (TS):
| Invalid frontmatter in "f.mdx":
| - status: Invalid enum value. Expected 'draft' | 'active' | 'paused' | 'concluded', received 'published' (must be one of: draft, active, paused, concluded)
full message (PY):
| Invalid frontmatter in "f.mdx":
| - status: Invalid enum value. Expected 'draft' | 'active' | 'paused' | 'concluded', received 'published' (must be one of: draft, active, paused, concluded)

### file:err-validation-many — IDENTICAL

full message (TS):
| Invalid frontmatter in "content/programs/bad.mdx":
| - title: String must contain at least 1 character(s) (must be at least 1 character(s))
| - slug: Slug must be lowercase kebab-case (e.g. cyclone-modeling) (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
| - description: Required (this field is required)
| - date: Date must be in YYYY-MM-DD format (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
| - status: Invalid enum value. Expected 'draft' | 'active' | 'paused' | 'concluded', received 'published' (must be one of: draft, active, paused, concluded)
| - tags.1: String must contain at least 1 character(s) (must be at least 1 character(s))
| - theme: Required (this field is required)
| - leadResearcher: Required (this field is required)
| - relatedQuestionSlugs: Expected array, received string (expected array, received string)
full message (PY):
| Invalid frontmatter in "content/programs/bad.mdx":
| - title: String must contain at least 1 character(s) (must be at least 1 character(s))
| - slug: Slug must be lowercase kebab-case (e.g. cyclone-modeling) (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
| - description: Required (this field is required)
| - date: Date must be in YYYY-MM-DD format (check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL))
| - status: Invalid enum value. Expected 'draft' | 'active' | 'paused' | 'concluded', received 'published' (must be one of: draft, active, paused, concluded)
| - tags.1: String must contain at least 1 character(s) (must be at least 1 character(s))
| - theme: Required (this field is required)
| - leadResearcher: Required (this field is required)
| - relatedQuestionSlugs: Expected array, received string (expected array, received string)

### relationship:dangling-one — IDENTICAL

full message (TS):
| Entity "question:orphan" has a dangling reference in "programSlug": target "program:no-such-program" does not exist.
full message (PY):
| Entity "question:orphan" has a dangling reference in "programSlug": target "program:no-such-program" does not exist.

ALL 9 PAIRS CHARACTER-IDENTICAL: True

```

```

**Result: 9 of 9 pairs character-identical** (7 fixtures covering missing required field, bad slug casing, bad date, bad enum on two fields, empty slug producing two issues, bad URL; one real 9-issue file; one dangling relationship). No divergence to excuse.

Caveat on the claim: this is nine samples run live. The ~300-fixture comparison in `validation-issues.json` (Phase 2) is the broader check, and it compares TS output captured from a previous run, not a live one. I re-ran it in the clean worktree (item 6) and it passes.

---

## 4. Phase 1 addendum

Appended, dated 2026-10-22, to `backend/PHASE1-FINDINGS.md`; the original text is untouched. It covers the `Slug` change (single `AfterValidator`, `slug_empty` expanded into two issues by `kernel/errors.py`), the 411 vs 412 correction, and the wrong `.gitignore` statement. I also appended short dated addenda to `backend/PHASE2-FINDINGS.md` (same two wrong statements) and to `spikes/ladybugdb-phase0/FINDINGS.md` (the stale-`build/` problem, item 7), since those files made the same mistake. Current `Slug` in `backend/schemas/common.py`:

```
_SLUG_MESSAGE = "Slug must be lowercase kebab-case (e.g. cyclone-modeling)"
Slug = Annotated[str, AfterValidator(_slug)]
```

---

## 5. `file_path` safety

Full output: `filepath-evidence.txt`. Every use of `filePath` / `file_path` / `sourcePath` in tracked non-test TypeScript (`git grep` searches tracked files only, so the stale untracked `build/` files are excluded):

```
$ git grep -n -E "filePath|file_path|sourcePath" -- "*.ts" "*.tsx" ":!*.test.ts"   (tracked files only)
build/targets/duckdb-target.ts:32:        "CREATE TABLE knowledge_entity (id VARCHAR, kind VARCHAR, slug VARCHAR, title VARCHAR, summary VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR, content VARCHAR, file_path VARCHAR, metadata JSON);",
build/targets/duckdb-target.ts:80:    sqlString(entity.filePath),
kernel/authoring.ts:101:        sourcePath: `knowledge/${object.kind}/${String(validation.data.slug)}.json`,
kernel/errors.ts:6:    readonly filePath: string,
kernel/errors.ts:10:      `Failed to read or parse "${filePath}": ${cause instanceof Error ? cause.message : String(cause)}`,
kernel/errors.ts:32:    readonly filePath: string,
kernel/errors.ts:39:    super(`Invalid frontmatter in "${filePath}":\n${body}`);
kernel/loaders/load-all.ts:17:    discoverSourceFiles(registration, parser).map((sourcePath) => {
kernel/loaders/load-all.ts:18:      const parsed = parseSource(sourcePath, parser);
kernel/parsers/markdown-parser.ts:26:  parse(sourcePath: string): ParsedSource {
kernel/parsers/markdown-parser.ts:28:      const raw = readFileSync(sourcePath, "utf-8");
kernel/parsers/markdown-parser.ts:30:      const slug = extractSlug(data, sourcePath);
kernel/parsers/markdown-parser.ts:31:      return { slug, data, content: content.trim(), sourcePath };
kernel/parsers/markdown-parser.ts:33:      throw new KnowledgeParseError(sourcePath, cause);
kernel/parsers/parser.ts:6:  readonly sourcePath: string;
kernel/parsers/parser.ts:19:  parse(sourcePath: string): ParsedSource;
kernel/pipeline/factory.ts:41:    filePath: parsed.sourcePath,
kernel/pipeline/parsing.ts:4:export function parseSource(sourcePath: string, parser: Parser): ParsedSource {
kernel/pipeline/parsing.ts:5:  return parser.parse(sourcePath);
kernel/pipeline/validation.ts:18:    throw new KnowledgeValidationError(parsed.sourcePath, result.error as ZodError);
kernel/types.ts:47:  readonly filePath: string;
lib/markdown/read-content-file.ts:18:  filePath: string,
lib/markdown/read-content-file.ts:21:  const raw = readFileSync(filePath, "utf-8");
lib/markdown/read-content-file.ts:24:  const slug = extractSlug(frontmatter, filePath);
lib/markdown/read-content-file.ts:26:  return { slug, frontmatter, content: content.trim(), filePath };
lib/markdown/read-content-file.ts:34:export function extractSlug(frontmatter: unknown, filePath: string): string {
lib/markdown/read-content-file.ts:43:  return basename(filePath).replace(/\.mdx?$/, "");
lib/markdown/types.ts:6:  readonly filePath: string;
runtime/adapters/artifact-knowledge-source-adapter.ts:33:  readonly file_path: string;
runtime/adapters/artifact-knowledge-source-adapter.ts:87:        "SELECT id, kind, slug, title, summary, status, created_at, updated_at, content, file_path, metadata FROM knowledge_entity ORDER BY created_at DESC, id ASC",
runtime/adapters/artifact-knowledge-source-adapter.ts:163:      filePath: row.file_path,

$ git grep -n -E "\.filePath|\.file_path" -- app components lib runtime domain authoring auth build
build/targets/duckdb-target.ts:80:    sqlString(entity.filePath),
runtime/adapters/artifact-knowledge-source-adapter.ts:163:      filePath: row.file_path,

$ git grep -n -i -E "path|sep\b" -- authoring ":!*.test.ts"
authoring/renderers/mdx-renderer.ts:27:      relativePath: `${definition.contentDir}/${String(validation.data.slug)}.mdx`,
authoring/types.ts:20:      path: z.string().min(1),
authoring/types.ts:47:  readonly relativePath: string;
authoring/workflow.ts:2:import { dirname, resolve, sep } from "node:path";
authoring/workflow.ts:109:    const target = this.publicationPath(rendered.relativePath);
authoring/workflow.ts:110:    const previous = document.publication?.path
authoring/workflow.ts:111:      ? this.publicationPath(document.publication.path)
authoring/workflow.ts:138:        path: rendered.relativePath.replace(/\\/g, "/"),
authoring/workflow.ts:146:  private publicationPath(relativePath: string): string {
authoring/workflow.ts:147:    const path = resolve(this.root, relativePath);
authoring/workflow.ts:148:    if (!path.startsWith(`${this.root}${sep}`))
authoring/workflow.ts:149:      throw new Error("Publication path leaves the project root.");
authoring/workflow.ts:150:    return path;
authoring/workflow.ts:154:async function optionalRead(path: string): Promise<string | undefined> {
authoring/workflow.ts:156:    return await readFile(path, "utf8");
authoring/workflow.ts:163:async function optionalDelete(path: string): Promise<void> {
authoring/workflow.ts:165:    await unlink(path);
authoring/workflow.ts:171:async function restore(path: string, content: string | undefined): Promise<void> {
authoring/workflow.ts:172:  if (content === undefined) return optionalDelete(path);
authoring/workflow.ts:173:  await mkdir(dirname(path), { recursive: true });
authoring/workflow.ts:174:  await writeFile(path, content, "utf8");

$ sed -n 60,70p build/targets/manifest-target.ts   (real contentHash: no filePath)

/** Deterministic, order-independent fingerprint of source content — changes iff any entity's identity, update time, or body changes. */
function contentHash(entities: readonly KnowledgeEntity[]): string {
  const material = [...entities]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((entity) => `${entity.id}|${entity.updatedAt}|${entity.content}`)
    .join("\n");
  return createHash("sha256").update(material).digest("hex");
}

$ git grep -n "metadata" -- kernel/pipeline/factory.ts build/targets/duckdb-target.ts
build/targets/duckdb-target.ts:32:        "CREATE TABLE knowledge_entity (id VARCHAR, kind VARCHAR, slug VARCHAR, title VARCHAR, summary VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR, content VARCHAR, file_path VARCHAR, metadata JSON);",
build/targets/duckdb-target.ts:81:    sqlString(JSON.stringify(entity.metadata)),
kernel/pipeline/factory.ts:38:    metadata: Object.freeze({ tags: frontmatter.tags }),
```

Reading that output:

- **Producer:** `kernel/pipeline/factory.ts:41` sets `entity.filePath = parsed.sourcePath`, which is `join(contentDir, file)`, so backslashes on Windows, forward slashes elsewhere.
- **The only writer to persistence:** `build/targets/duckdb-target.ts:80` writes it into the `file_path` column.
- **The only reader:** `runtime/adapters/artifact-knowledge-source-adapter.ts:163` hydrates it back into `entity.filePath`.
- **Error messages:** `KnowledgeParseError` and `KnowledgeValidationError` embed it in message text.
- **No comparison anywhere.** The second grep (`\.filePath|\.file_path` in `app components lib runtime domain authoring auth build`) finds exactly one hit, the adapter hydration line. Nothing in `app/`, `components/`, `lib/`, `domain/` or `authoring/` reads it. It is not used as a Map or object key, and it is not in `contentHash` (which hashes `id|updatedAt|content`, see below).
- **`authoring/workflow.ts`'s publication-path tracking is a different value.** It stores `rendered.relativePath` (built in `authoring/renderers/mdx-renderer.ts:27` as `${definition.contentDir}/${slug}.mdx`, always forward slashes) and normalizes with `.replace(/\\/g, "/")` at `workflow.ts:138`. The comparison there (`startsWith(root + sep)` at line 148) is on a resolved absolute path built from that relative path, not on `entity.filePath`. The two values never meet.
- **Tests:** the only equality checks on it are `factory.test.ts:46` (`entity.filePath` equals `parsed.sourcePath`, same side) and `validation.test.ts:54` (a hand-written `"content/notes/x.mdx"`). No cross-representation comparison.

**Verdict: safe.** Nothing compares the Python form (`content/programs/x.mdx`) with the TS form (possibly `content\programs\x.mdx`). The one consumer that crosses the boundary, the adapter reading the DuckDB column, just stores and passes the string through. Two cautions for Phase 3:

1. If the Python build writes `file_path`, an artifact built on Linux (forward slashes) and one built from the TS pipeline on Windows (backslashes) will differ in that column. That is harmless today because `contentHash` excludes it, but a byte-for-byte artifact diff between the two producers (the plan in ADR-003 Phase 4) must normalize or skip `file_path`.
2. The real `contentHash` is sorted with `localeCompare`, which is locale-dependent. A Python reimplementation cannot match it by sorting alone in every locale. That belongs to Phase 3, but it is in the same file I was reading.

---

## 6. Full verification

### TypeScript, clean checkout (`origin/main` + only my new files)

```
$ pnpm typecheck
```

> stories@3.0.0 typecheck C:\Users\gblaguerre\Documents\Data Analytics Projects\stories-clean
> tsc --noEmit

```
$ pnpm lint
```

> stories@3.0.0 lint C:\Users\gblaguerre\Documents\Data Analytics Projects\stories-clean
> eslint .

```
$ pnpm test   (tail)
```

✓ runtime/adapters/clock.test.ts (2 tests) 14ms
✓ build/pipeline.kernel-failure.test.ts (1 test) 577ms
✓ runBuildPipeline — Kernel failure > never rejects; a Kernel error becomes a validationIssue and success: false 573ms
✓ build/targets/registry.test.ts (1 test) 9ms
Test Files 46 passed | 1 skipped (47)
Tests 610 passed | 1 skipped (611)
Start at 15:41:12
Duration 11.98s (transform 5.75s, setup 0ms, collect 40.01s, tests 14.27s, environment 34ms, prepare 25.32s)

```

```

The first typecheck in the clean worktree failed with three errors in **my** Phase 0 spike test (`'expected' is possibly 'undefined'` in `spikes/ladybugdb-phase0/artifact-contract.spike.test.ts`). I fixed it (a guard before use) and re-ran, as shown above. That file was never typechecked before. The Phase 1 and Phase 2 contract files (`fixtures/**`) typechecked, linted and ran clean on the first try.

`pnpm test` here: **46 test files passed, 1 skipped; 610 tests passed, 1 skipped.** The skipped one is the spike test, which skips itself when its `out/` directory is missing. This run includes `fixtures/schema-contract` and `fixtures/kernel-contract`.

### TypeScript, the main checkout (what you would see locally right now)

```
$ pnpm typecheck   (all 37 lines)
```

> stories@3.0.0 typecheck C:\Users\gblaguerre\Documents\Data Analytics Projects\stories
> tsc --noEmit

.next/types/app/studio/documents/[id]/page.ts(2,24): error TS2307: Cannot find module '../../../../../../app/studio/documents/[id]/page.js' or its corresponding type declarations.
.next/types/app/studio/documents/[id]/page.ts(5,29): error TS2307: Cannot find module '../../../../../../app/studio/documents/[id]/page.js' or its corresponding type declarations.
.next/types/app/studio/new/[kind]/page.ts(2,24): error TS2307: Cannot find module '../../../../../../app/studio/new/[kind]/page.js' or its corresponding type declarations.
.next/types/app/studio/new/[kind]/page.ts(5,29): error TS2307: Cannot find module '../../../../../../app/studio/new/[kind]/page.js' or its corresponding type declarations.
.next/types/app/studio/page.ts(2,24): error TS2307: Cannot find module '../../../../app/studio/page.js' or its corresponding type declarations.
.next/types/app/studio/page.ts(5,29): error TS2307: Cannot find module '../../../../app/studio/page.js' or its corresponding type declarations.
.next/types/validator.ts(152,39): error TS2307: Cannot find module '../../app/studio/documents/[id]/page.js' or its corresponding type declarations.
.next/types/validator.ts(161,39): error TS2307: Cannot find module '../../app/studio/new/[kind]/page.js' or its corresponding type declarations.
.next/types/validator.ts(170,39): error TS2307: Cannot find module '../../app/studio/page.js' or its corresponding type declarations.
app/studio/(protected)/layout.tsx(9,45): error TS2345: Argument of type '"/studio/login"' is not assignable to parameter of type 'RouteImpl<"/studio/login">'.
build/manifest/build-manifest.test.ts(4,15): error TS2305: Module '"../targets/types"' has no exported member 'BuildTargetResult'.
build/manifest/build-manifest.ts(2,15): error TS2305: Module '"../targets/types"' has no exported member 'BuildTargetResult'.
build/manifest/build-manifest.ts(3,57): error TS2724: '"../version"' has no exported member named 'getPlatformVersion'. Did you mean 'PLATFORM_VERSION'?
build/pipeline/orchestrator.test.ts(4,28): error TS2305: Module '"../targets/types"' has no exported member 'BuildTargetResult'.
build/pipeline/orchestrator.test.ts(33,3): error TS2322: Type '{ name: string; execute: Mock<() => Promise<BuildTargetResult>>; }' is not assignable to type 'BuildTarget & { execute: Mock<Procedure>; }'.
Property 'run' is missing in type '{ name: string; execute: Mock<() => Promise<BuildTargetResult>>; }' but required in type 'BuildTarget'.
build/pipeline/orchestrator.test.ts(88,7): error TS2353: Object literal may only specify known properties, and 'execute' does not exist in type 'BuildTarget'.
build/pipeline/orchestrator.test.ts(88,23): error TS7006: Parameter 'context' implicitly has an 'any' type.
build/pipeline/orchestrator.ts(5,28): error TS2305: Module '"../targets/types"' has no exported member 'BuildTargetResult'.
build/pipeline/orchestrator.ts(66,35): error TS2339: Property 'execute' does not exist on type 'BuildTarget'.
build/pipeline/validate-artifacts.test.ts(10,15): error TS2305: Module '"../targets/types"' has no exported member 'BuildTargetResult'.
build/pipeline/validate-artifacts.ts(3,10): error TS2305: Module '"../duckdb/connect"' has no exported member 'connectToKnowledgeDatabase'.
build/pipeline/validate-artifacts.ts(6,15): error TS2305: Module '"../targets/types"' has no exported member 'BuildTargetResult'.
build/targets/registrations.ts(1,10): error TS2724: '"./duckdb-target"' has no exported member named 'DuckDBBuildTarget'. Did you mean 'duckDBBuildTarget'?
build/targets/registrations.ts(2,10): error TS2724: '"./manifest-target"' has no exported member named 'ManifestBuildTarget'. Did you mean 'manifestBuildTarget'?
build/version.test.ts(2,57): error TS2724: '"./version"' has no exported member named 'getPlatformVersion'. Did you mean 'PLATFORM_VERSION'?
components/authoring/auth-forms.tsx(61,13): error TS2322: Type '"/studio/reset-password"' is not assignable to type 'UrlObject | RouteImpl<"/studio/reset-password">'.
components/authoring/auth-forms.tsx(106,13): error TS2322: Type '"/studio/login"' is not assignable to type 'UrlObject | RouteImpl<"/studio/login">'.
components/authoring/auth-forms.tsx(138,34): error TS2345: Argument of type '"/studio/login"' is not assignable to parameter of type 'RouteImpl<"/studio/login">'.
spikes/ladybugdb-phase0/artifact-contract.spike.test.ts(30,80): error TS18048: 'expected' is possibly 'undefined'.
spikes/ladybugdb-phase0/artifact-contract.spike.test.ts(31,82): error TS18048: 'expected' is possibly 'undefined'.
spikes/ladybugdb-phase0/artifact-contract.spike.test.ts(32,80): error TS18048: 'expected' is possibly 'undefined'.
 ELIFECYCLE  Command failed with exit code 2.

```

```

```
$ pnpm test   (failures and summary)
```

FAIL build/pipeline/orchestrator.test.ts [ build/pipeline/orchestrator.test.ts ]
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
FAIL build/version.test.ts > getPlatformVersion > reads the real package.json's version field
FAIL build/manifest/build-manifest.test.ts > buildManifest > carries version constants, counts, contentHash, and generationDuration >= 0
FAIL build/manifest/build-manifest.test.ts > buildManifest > populates artifacts generically from priorResults, keyed by BuildTargetResult.key, never by target name
FAIL build/pipeline/validate-artifacts.test.ts > validateArtifacts > returns no issues when row counts and checksums all match
FAIL build/pipeline/validate-artifacts.test.ts > validateArtifacts > reports a row-count-entity issue when the actual row count differs from expected
Test Files 4 failed | 61 passed (65)
Tests 5 failed | 649 passed (654)

```
$ pnpm lint
```

> stories@3.0.0 lint C:\Users\gblaguerre\Documents\Data Analytics Projects\stories
> eslint .

```

```

Everything except the three spike lines (now fixed) comes from files that are not on `origin/main`:

- `build/manifest/*`, `build/pipeline/*`, `build/targets/registrations.ts`, `build/version.test.ts`: the stale untracked files (item 2). They import names (`BuildTargetResult`, `getPlatformVersion`, `DuckDBBuildTarget`) that the shipped `build/` does not export. The 5 test failures are all in those files.
- `.next/types/**`, `app/studio/(protected)/layout.tsx`, `components/authoring/auth-forms.tsx`: `RouteImpl` and "Cannot find module app/studio/..." errors. These come from a stale ignored `.next/types` (typed routes generated before the Studio routes existed). They disappear in the clean worktree, which has no `.next`.

I did not fix these, since they are local state and not code. Deleting `.next/` and moving the 39 stale `build/` files should make this checkout match the clean result.

### Python

```
$ pytest -v     (backend/, full log: pytest-all-verbose.txt)
```

tests/test_schema_contract.py::test_fixture[software/valid-url-repositoryUrl-returned-verbatim] PASSED [100%]
============================= 765 passed in 1.94s =============================

```

```

**765 passed** (422 schema contract + 343 kernel contract).

`backend/pyproject.toml` defines no linter, formatter or type checker. Its only tool section is `[tool.pytest.ini_options]`:

```
[project]
name = "stories-backend"
version = "0.1.0"
description = "Python backend for Stories (ADR-004). Phase 1: Pydantic schema contract."
requires-python = ">=3.12"
dependencies = [
    "pydantic>=2.9,<3",
    # YAML 1.2 (like js-yaml 3 behind gray-matter): `yes`/`no`/`on`/`off` stay strings.
    "ruamel.yaml>=0.18,<0.19",
]

[dependency-groups]
dev = ["pytest>=8"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

As instructed, I did not add tooling. **Gap for Phase 3+:** no ruff/mypy/pyright config. The `# type: ignore[assignment]` comments on optional fields in `backend/schemas/` have never been checked by a type checker.

Also not run: `pnpm format:check` (prettier), which is not part of `release:verify`.

---

## 7. Corrections to earlier phases (discovered while doing item 2)

All of these trace to reading a stale, never-committed `build/`. Evidence: items 2 and 5, plus these commands run on `origin/main`:

```
$ git ls-files build | wc -l ; git ls-files --others --exclude-standard build | wc -l
20
39

$ git ls-files build
build/README.md
build/cli.ts
build/duckdb/connect.ts
build/index.ts
build/pipeline.chain.test.ts
build/pipeline.kernel-failure.test.ts
build/pipeline.test.ts
build/pipeline.ts
build/report.test.ts
build/report.ts
build/targets/duckdb-target.test.ts
build/targets/duckdb-target.ts
build/targets/manifest-target.test.ts
build/targets/manifest-target.ts
build/targets/registry.test.ts
build/targets/registry.ts
build/targets/round-trip.test.ts
build/targets/types.ts
build/types.ts
build/version.ts
```

1. **Two tables, not four.** The shipped `duckdb-target.ts` creates exactly `knowledge_entity` and `knowledge_relationship`, with **no primary key and no NOT NULL**, and there is no `knowledge_snapshot` or `knowledge_metadata` (grep above returns nothing). My Phase 0 spike exported four tables with constraints, copied from the stale `build/duckdb/schema.ts`. The adapter happily read that superset, but the spike did **not** reproduce the real schema, and ADR-004 "correction 3" (two vs four, "needs a Phase 1 decision") rests on that. The decision is already made by the code: **two tables.** The ADR and `build/README.md` need no "superset" question. A Phase 3 Python exporter should create exactly those two tables (and should probably keep the lack of constraints, since the adapter's `SELECT ... ORDER BY` does not need them).
2. **`contentHash` lives in `build/targets/manifest-target.ts`** and hashes `id|updatedAt|content` lines (sorted by `localeCompare`). The `build/hash/content-hash.ts` / `canonical-json.ts` algorithm I described in Phase 0 is the stale one. ADR-004's reference to "`contentHash()` in that file" is accurate for the real code.
3. **Kind-specific fields are not persisted by the shipped pipeline (a real, verified bug in shipped code; I did not introduce it and did not change it).** The Kernel factory sets `metadata = { tags }` only; fields such as `theme`, `leadResearcher`, `programSlug`, `venue`, `noteType` are top-level properties on the entity. `duckdb-target.ts` writes `JSON.stringify(entity.metadata)`, so they never reach `knowledge.duckdb`. The adapter hydrates `...metadata`, so they are absent after the round trip. Production reads the artifact (`lib/presentation/runtime.ts:24`), and `app/programs/[slug]/page.tsx` shows `field(program, "theme") ?? "Open inquiry"` and `field(program, "leadResearcher") ?? "Not specified"`. Measured with the real stages end to end (`metadata-persistence-evidence.txt`):

```
KERNEL ENTITY program:lab theme = "Climate" | metadata = {"tags":["alpha","zeta","😀","ﬁ"]}
ARTIFACT-HYDRATED program:lab theme = undefined | leadResearcher = undefined | metadata = {"tags":["alpha","zeta","😀","ﬁ"]}
ARTIFACT-HYDRATED question:q-one programSlug = undefined | relationships = [{"field":"programSlug","cardinality":"one","target":{"id":"program:lab","kind":"program","slug":"lab","title":"Laboratory"}}]
```

`build/targets/round-trip.test.ts` does not catch this because its hand-built fixture puts `theme` and `programSlug` inside `metadata`, which the real Kernel never does. The stale pipeline avoided the problem with an `extractFullMetadata()` step that the shipped code lacks. Relationships do survive (via `knowledge_relationship`). **Phase 3 must decide** whether the Python exporter keeps today's behavior or fixes it, and the `round-trip.test.ts` fixture should then be made realistic so the decision is locked by a test. 4. **The build checks I relied on in Phase 2** ("`build/`'s duplicate-id check is what catches duplicate ids") refer to `build/pipeline/checks/duplicate-ids.ts`, which is among the stale untracked files. `origin/main`'s tracked `build/` has no such check (`git ls-files build` above lists no `checks/` directory, and `git grep -i duplicate -- build ':!build/README.md'` returns nothing). So **nothing in the shipped pipeline catches duplicate ids**: the Kernel silently keeps the last one (confirmed in both languages by the `ok-duplicate-slug` scenario). That is worth a Phase 3 decision as well. 5. **What was not affected:** the schema contract (Phase 1) and the Kernel port (Phase 2) only read `schemas/`, `domain/` and `kernel/`, which are tracked and were not stale. The Phase 2 contract tests pass unchanged in the clean checkout. LadybugDB's Python API behavior and the DuckDB storage-version skew from the spike are unaffected.

ADR-003 and ADR-004 are untracked files in this checkout and I did not edit them. Items 7.1 to 7.4 are statements in ADR-004 that should be revised before Phase 3.

---

## Not done

- Nothing committed or pushed.
- The 39 stale untracked `build/` files and the stale `.next/` were not touched.
- No new Python tooling was added.
- No Phase 3 work started.
- The temporary worktree used for item 6 was removed after the run (the `node_modules` junction was removed first, so the real `node_modules` is intact).
