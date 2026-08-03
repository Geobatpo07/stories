# kernel/ — the Knowledge Kernel

The heart of Stories Platform. Everything else — the Next.js app, a future CLI, a future
REST API, a future AI agent — is an _adapter_ over this. The Kernel owns the domain, the
lifecycle of knowledge, relationship resolution, validation, and discovery. It does not
know Next.js, React, Tailwind, rendering, databases, search, or AI.

## Dependency direction

The Kernel depends on nothing above it, yet it reuses `domain/*/schema.ts` and produces
the domain types every `domain/*/service.ts` exposes. This resolves at **file**
granularity, not module granularity:

- `kernel/**` imports **only** `domain/*/schema.ts` — never a module's `types.ts`,
  `service.ts`, or its barrel `index.ts` (the barrel re-exports `service.ts`, which
  imports the Kernel — importing the barrel from inside the Kernel would create a real
  cycle).
- `domain/*/service.ts` imports **only** `@/kernel` (this package's public barrel) — it
  is a thin wrapper, a consumer of the Kernel, nothing more.
- `domain/*/types.ts` additively re-exports the Kernel's enriched per-kind entity type
  (e.g. `export type { ProgramEntity } from "@/kernel"`) for convenience — one-directional,
  not a cycle.
- `domain/*/schema.ts` itself is untouched by any of this.

So the real graph is: `schemas/` → `domain/*/schema.ts` → `kernel/` → `domain/*/service.ts`,
plus `kernel/` → `domain/*/types.ts` (re-export only). No file-level cycle exists even
though "the Kernel reuses the domain" and "the domain consumes the Kernel" both sound
true at once. **Do not import `domain/*/types.ts` or `domain/*/service.ts` from inside
`kernel/`** — that is the one rule that would break this.

`kernel/**` itself takes zero imports from `next`, `react`, `app/`, `components/`,
`lib/duckdb`, `lib/search`, `lib/metadata`. Enforced by convention/review this sprint; an
ESLint `no-restricted-imports` rule scoped to `kernel/**` is a reasonable follow-up.

## The Knowledge Lifecycle

Nothing bypasses this pipeline. Every entity, from every source, goes through all eight
stages before it is servable:

```
Knowledge Source → Discovery → Loading → Parsing → Validation → Normalization →
Domain Factory → Relationship Resolution → Knowledge Graph → Public API
```

| Stage                   | Module                                         | What it does                                                                                                             |
| ----------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Discovery               | `kernel/pipeline/discovery.ts`                 | Lists every source file for one registration. Pure listing, no parsing.                                                  |
| Loading + Parsing       | `kernel/parsers/markdown-parser.ts`            | Reads a file, splits frontmatter from body. Returns raw, **unvalidated** data.                                           |
| Validation              | `kernel/pipeline/validation.ts`                | Parses raw frontmatter against the registration's Zod schema. Throws `KnowledgeValidationError`, never a raw `ZodError`. |
| Normalization           | `kernel/pipeline/normalization.ts`             | Canonicalizes validated frontmatter (today: dedupe/sort `tags`).                                                         |
| Domain Factory          | `kernel/pipeline/factory.ts`                   | Turns normalized frontmatter into a `KnowledgeEntity`. Generic, registry-driven — no per-kind factory functions.         |
| Relationship Resolution | `kernel/pipeline/relationships.ts`             | Resolves every `*Slug`/`*Slugs` field into a `Relationship`, in one closed-world pass after every entity has loaded.     |
| Knowledge Graph         | `kernel/pipeline/graph.ts`                     | Builds the in-memory node/edge graph from resolved entities.                                                             |
| Public API              | `kernel/api.ts` + `kernel/loaders/load-all.ts` | The only door in or out — see below.                                                                                     |

`kernel/loaders/load-all.ts` is the single closed-world orchestrator that runs every
registration through the first six stages, then resolves relationships across the whole
loaded set — a Question can only resolve its `programSlug` once the Program it
references is guaranteed to already exist in the id map.

## Why `MarkdownParser` doesn't reuse `lib/markdown`'s `readContentFile`

`lib/markdown/read-content-file.ts` fuses parsing (gray-matter) and Zod validation into
one call. Reusing it here would collapse Parsing and Validation into a single physical
step and make a `ZodError` indistinguishable from a genuine file-read failure.
`MarkdownParser.parse()` calls `gray-matter` directly and returns **unvalidated** data;
it does reuse `lib/markdown`'s `listContentFiles` (pure listing, safe to share) and its
`extractSlug` helper (exported from `lib/markdown` specifically for this reuse — no
duplicated slug-fallback logic).

## The registry: how new entity kinds become pluggable

`kernel/registry/registrations.ts` is the **only** place any per-entity-kind knowledge
exists in the Kernel. Every pipeline stage loops over this list generically — there are
no per-kind branches anywhere else:

```ts
interface EntityRegistration<T> {
  kind: EntityKind; // = ContentType, from schemas/content-type.ts
  contentDir: string; // e.g. "content/programs"
  schema: z.ZodType<T, ZodTypeDef, unknown>;
  relationshipFields: RelationshipFieldSpec[]; // e.g. { field: "programSlug", cardinality: "one", targetKind: "program" }
}
```

The Domain Factory doesn't hand-write one function per kind either:
`baseFrontmatterSchema.shape`'s keys are introspected once to know which fields are
"base" (promoted to a named `KnowledgeEntity` slot) vs. "extra" (spread generically onto
the result — this is exactly what lets `domain/*/types.ts`'s per-kind entity aliases,
`Pick<XFrontmatter, "theme" | ...>`, work without the factory knowing about `theme`).

**To add a 10th entity kind:** add one value to `schemas/content-type.ts`'s enum, create
`domain/<x>/` (schema/types/service/README, following the existing pattern), create
`content/<x>/`, add one entry to `registrations.ts`. No other Kernel file changes.

## Notes vs. Tutorial — why they're one collection, not two

`ResearchNote` and `Tutorial` are conceptually distinct in the Sprint 2 brief, but Sprint
1 already modeled them as one `domain/knowledge` module (`KnowledgeObject` + a `noteType`
enum) because they share every field and the same lifecycle — only editorial convention
differs. The Kernel keeps that: `loadResearchNotes()` and `loadTutorials()` are filtered
views over `loadKnowledgeObjects()` (`entity.noteType === "research-note"` / `"tutorial"`),
not separate schemas or content collections. If one `noteType` ever grows fields the
others don't need, that's the trigger to split it into its own domain module — not
before.

## Core shapes

```ts
interface KnowledgeEntity {
  id: string; // `${kind}:${slug}` — globally unique across collections
  kind: EntityKind;
  slug: Slug; // unique within `kind` only
  title: string;
  summary: string; // ← frontmatter.description
  status: ContentStatus;
  createdAt: IsoDate; // both ← frontmatter.date — Sprint 1 has one date field;
  updatedAt: IsoDate; //   split these once a content type needs both independently
  metadata: Record<string, unknown>; // { tags, ...anything not promoted to a named field }
  relationships: readonly Relationship[]; // this entity's OWN *Slug fields, resolved
  content: string; // raw MDX body — the sanctioned path to it
  filePath: string;
}
```

`Relationship.target` is a lightweight `ResolvedRef` (`{ id, kind, slug, title }`), not
the full entity — this avoids circular construction (A references B which references A)
while still giving callers a real, displayable object and an O(1) escape hatch
(`findById(target.id)`) when they need the full entity.

## Public API (`kernel/index.ts`)

The **only** sanctioned entry point. Internals (`parsers/`, `registry/`, `pipeline/`,
`loaders/`) are not re-exported and must not be imported directly from outside `kernel/`.

- `loadPrograms()`, `loadQuestions()`, `loadHypotheses()`, `loadExperiments()`,
  `loadKnowledgeObjects()`, `loadResearchNotes()`, `loadTutorials()`, `loadSoftware()`,
  `loadPublications()`, `loadDatasets()`, `loadPresentations()`, `loadEverything()`
- `findBySlug(kind, slug)`, `findById(id)` — return `undefined` on a miss.
- `findRelated(id)` — throws `KnowledgeNotFoundError` for an unknown id (almost always a
  typo) rather than silently returning `[]`, which would be indistinguishable from "a
  real entity with zero relationships."
- `getKnowledgeGraph()` — the full in-memory graph.
- `resetKernelCache()` — invalidates every memoized value; mainly for tests.
- Entity types (`KnowledgeEntity`, `ProgramEntity`, …), `Relationship`, `ResolvedRef`,
  `KnowledgeGraph`, `EntityKind`, and the four error classes (`KnowledgeParseError`,
  `KnowledgeValidationError`, `KnowledgeRelationshipError`, `KnowledgeNotFoundError`).

## Caching

`kernel/cache.ts`'s `createMemoized()` backs both `loadAll()` and `getKnowledgeGraph()` —
computed once per process, reused on every call. `resetKernelCache()` invalidates
everything created this way. **Extension point, not implemented:** incremental builds —
keying a slot's validity on source file mtimes instead of "valid for the whole process."

## Testing

Co-located `*.test.ts` next to source (matches this repo's co-located-README
convention). Run with `pnpm test`. One file per lifecycle stage plus registry/cache/errors,
and `kernel/api.test.ts` as an integration test against the real `content/` tree — a
regression check that content and schemas stay in sync as both evolve.

## Developer workflow

1. `pnpm typecheck && pnpm lint && pnpm test` — the fast local loop.
2. `pnpm kernel:verify` (`scripts/verify-kernel.ts`) — loads everything for real, prints
   per-collection counts and one spot-checked relationship resolution. Use this after
   touching a schema or adding content to confirm nothing dangling was introduced.

## Future adapters

None exist yet beyond `domain/*/service.ts` (which is itself the thinnest possible
adapter, existing only so `app/`/`components/` can keep going through `domain/` per
`docs/architecture/Architecture.md`). Sprint 3+ candidates, all consuming `@/kernel` the
same way: a DuckDB indexing adapter, a search adapter, a REST API adapter, a CLI adapter,
an AI agent adapter. None of them require a Kernel change — that's the point of the
registry and the Public API boundary.
