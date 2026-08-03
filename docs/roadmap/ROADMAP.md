# Roadmap

Sprint 1 delivered foundations only. Sprint 2 built the Knowledge Kernel — the lifecycle,
relationship resolution, in-memory Knowledge Graph, and a stable Public API — on top of
it (see kernel/README.md). Sprint 3 built the Platform Runtime — composition root,
dependency injection, lifecycle management, an in-memory event bus, and port interfaces
— on top of the Kernel (see runtime/README.md). Sprint 4 built the Knowledge Artifact
Pipeline — a build-time compiler from the Knowledge Graph into
`database/generated/knowledge.duckdb` and `manifest.json` (see build/README.md). Sprint 5
completed the public Presentation Layer and wired `app/` to the Runtime's verified
generated snapshot. Sprint 6 completed the Knowledge Experience and Version 2 release
preparation. See `docs/presentation/SPRINT-6.md` for the final delivered experience.

1. **First vertical slice.** Pick one entity (Research Program is the natural start,
   since everything else references it), wire a server-only bootstrap module that calls
   `createPlatformRuntime(...).start()` once and shares the resulting `ApplicationContext`,
   and build the one route and one `components/research` component that renders it. The
   Kernel's public API, `domain/*/service.ts` wrappers, and the Runtime all already exist
   — this is purely a routing/rendering/wiring exercise now. Resolve the still-open **MDX
   rendering strategy** question (docs/architecture/Architecture.md) as part of this
   slice, since it's the first route that actually needs to render a note's body.
2. **Wire the Runtime to consume the Build Pipeline's artifacts** instead of reading the
   Kernel live — a `DuckDBKnowledgeSourceAdapter` implementing `runtime/`'s
   `KnowledgeSourcePort` by reading `manifest.json` + `knowledge.duckdb`, matching the
   Runtime Contract described in build/README.md (read manifest, validate artifact
   integrity, load the database, never rebuild automatically, never parse Markdown at
   startup). Explicitly deferred out of Sprint 4's scope ("only implement the build
   pipeline").
3. **Real `PersistencePort`/`SearchPort`/`ExportPort` implementations** once a concrete
   need exists — the interfaces are already defined in `runtime/ports/types.ts`; no
   Runtime change is required to add a real adapter.
4. **Future Build Targets** once a concrete need exists — `SearchIndexBuildTarget`,
   `GraphBuildTarget`, `StatisticsBuildTarget`, `EmbeddingBuildTarget`,
   `VectorIndexBuildTarget` are named candidates in build/README.md; adding one is one
   file + one registry entry, no orchestrator change.
5. **Design system.** Deliberately not started yet — see the platform audit for why the
   visual identity should be derived from the subject matter, not defaulted.
6. **Academic discoverability layer** (`lib/metadata`): `citation_*` meta tags, BibTeX
   generation from `domain/publication`, JSON-LD for `Dataset` and `SoftwareSourceCode`.
