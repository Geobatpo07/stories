# Knowledge Authoring Studio architecture

## Boundary

The Studio is a private writing adapter over the existing platform. It does not replace the
public Presentation Layer or make the website read authoring storage.

```text
Dynamic Studio form
  → KnowledgeObjectRepository
  → Runtime PersistencePort
  → Supabase persistence_records (namespace "knowledge")

Publish
  → Kernel authoring validation
  → Knowledge Graph relationship resolution
  → KnowledgeRenderer (MDXRenderer)
  → content/<registered-directory>/<slug>.mdx
  → existing Knowledge Artifact Pipeline
  → manifest.json + knowledge.duckdb
  → existing Platform Runtime
  → public Presentation Layer
```

Only pre-publication draft state lives in Supabase. Publishing is unchanged: the final MDX
still goes straight to `content/` via `writeFile()`, Git-tracked — the permanent research
record stays a Git history, exactly as ADR-002 describes; only the mutable, work-in-progress
draft moved off the local filesystem.

## Modules

- `kernel/authoring.ts`: schema descriptors, friendly validation, normalization, and model
  materialization through the existing registration table.
- `authoring/repository.ts`: canonical object repository over `PersistencePort`.
- `runtime/adapters/supabase-persistence-adapter.ts`: durable persistence over Supabase's
  PostgREST HTTP API — see `supabase/migrations/0001_persistence_records.sql` and
  `auth/README.md`'s "Storage" section for why (Vercel's serverless functions can't write to
  a local filesystem the way `runtime/adapters/file-system-persistence-adapter.ts`, still
  used in tests, needs).
- `authoring/renderers/`: renderer contract and MDX implementation.
- `authoring/workflow.ts`: draft and transactional publication lifecycle.
- `components/authoring/`: reusable form, editor, picker, preview, status, and validation UI.
- `app/studio/`: private writing routes.
- `app/api/studio/`: local autosave and publication commands.

## Transactional publication

The workflow preserves the target and previous-slug MDX files before writing. It resets the
Kernel cache and runs the existing artifact build. A failed build restores both files and does
not mark the canonical object as published. A successful build records the exact publication
path and time, then invalidates Runtime and presentation caches.

## Extension points

- Add a publication format by implementing `KnowledgeRenderer`.
- Add a domain kind through the existing schema and Kernel registration process; its Studio
  form is generated automatically.
- Multi-author conflict resolution is intentionally not implemented — single-admin
  authentication now is (`auth/`, see its README).
