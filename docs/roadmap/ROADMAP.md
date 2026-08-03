# Roadmap

Sprint 1 delivered foundations only. Sprint 2 built the Knowledge Kernel — the lifecycle,
relationship resolution, in-memory Knowledge Graph, and a stable Public API — on top of
it (see kernel/README.md). Sprint 3 built the Platform Runtime — composition root,
dependency injection, lifecycle management, an in-memory event bus, and port interfaces
— on top of the Kernel (see runtime/README.md). It ships standalone this sprint, not yet
wired into `app/`. Rough shape of what follows, in order:

1. **First vertical slice.** Pick one entity (Research Program is the natural start,
   since everything else references it), wire a server-only bootstrap module that calls
   `createPlatformRuntime(...).start()` once and shares the resulting `ApplicationContext`,
   and build the one route and one `components/research` component that renders it. The
   Kernel's public API, `domain/*/service.ts` wrappers, and the Runtime all already exist
   — this is purely a routing/rendering/wiring exercise now. Resolve the still-open **MDX
   rendering strategy** question (docs/architecture/Architecture.md) as part of this
   slice, since it's the first route that actually needs to render a note's body.
2. **`database/build-index.ts` grows real indexing logic** once there's a concrete query
   it needs to serve (search is the most likely first driver) — it should consume
   `@/kernel`'s `loadEverything()`/`getKnowledgeGraph()` rather than re-implementing
   discovery/validation.
3. **Real `PersistencePort`/`SearchPort`/`ExportPort` implementations** once a concrete
   need exists — the interfaces are already defined in `runtime/ports/types.ts`; no
   Runtime change is required to add a real adapter.
4. **Design system.** Deliberately not started yet — see the platform audit for why the
   visual identity should be derived from the subject matter, not defaulted.
5. **Academic discoverability layer** (`lib/metadata`): `citation_*` meta tags, BibTeX
   generation from `domain/publication`, JSON-LD for `Dataset` and `SoftwareSourceCode`.
