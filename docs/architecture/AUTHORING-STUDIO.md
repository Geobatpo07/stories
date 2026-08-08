# Knowledge Authoring Studio architecture

## Boundary

The Studio is a private writing adapter over the existing platform. It does not replace the
public Presentation Layer or make the website read authoring storage.

```text
Dynamic Studio form
  → KnowledgeObjectRepository
  → Runtime PersistencePort
  → knowledge/<kind>/<uuid>.json

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

## Modules

- `kernel/authoring.ts`: schema descriptors, friendly validation, normalization, and model
  materialization through the existing registration table.
- `authoring/repository.ts`: canonical object repository over `PersistencePort`.
- `runtime/adapters/file-system-persistence-adapter.ts`: local deterministic JSON persistence.
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

- Add durable storage by implementing the existing `PersistencePort` contract.
- Add a publication format by implementing `KnowledgeRenderer`.
- Add a domain kind through the existing schema and Kernel registration process; its Studio
  form is generated automatically.
- Authentication and multi-author conflict resolution are intentionally not implemented.
