# Roadmap

This sprint delivered foundations only. Rough shape of what follows, in order:

1. **Resolve open questions** in docs/architecture/Architecture.md — Hypothesis's content
   source and the MDX rendering strategy — before content or components depend on a
   choice that then has to be unwound.
2. **First vertical slice.** Pick one entity (Research Program is the natural start,
   since everything else references it) and implement its `service.ts` for real: list
   all, resolve by slug. Build the one route and one `components/research` component that
   renders it. Prove the whole stack — content → domain → route → UI — before repeating
   the pattern for the other seven entities.
3. **`database/build-index.ts` grows real indexing logic** once there's a concrete query
   it needs to serve (search is the most likely first driver).
4. **Design system.** Deliberately not started this sprint — see the platform audit for
   why the visual identity should be derived from the subject matter, not defaulted.
5. **Academic discoverability layer** (`lib/metadata`): `citation_*` meta tags, BibTeX
   generation from `domain/publication`, JSON-LD for `Dataset` and `SoftwareSourceCode`.
