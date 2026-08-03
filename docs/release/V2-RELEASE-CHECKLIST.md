# Stories Platform V2 release checklist

## Knowledge snapshot

- [x] `pnpm build:knowledge` succeeds.
- [x] Manifest platform version is `2.0.0`.
- [x] Manifest checksum matches `knowledge.duckdb`.
- [x] Entity and relationship counts match the generated database.
- [x] No broken or unintended public relationships are reported.

## Application validation

- [x] `pnpm typecheck` passes.
- [x] `pnpm lint` has no errors.
- [x] `pnpm test` passes.
- [x] `pnpm build` statically generates every knowledge page.
- [x] No page or component imports source content, DuckDB, Build, or Kernel internals.

## Experience

- [x] Global search works with mouse, touch, `Ctrl/Cmd + K`, arrows, Enter, and Escape.
- [x] Programs, Projects, Stories, and Artifacts are discoverable through search.
- [x] Previous, next, parent, children, related content, and breadcrumbs are coherent.
- [x] Footnotes, tables, mathematics, figures, captions, citations, and code render correctly.
- [x] Reading progress, mobile contents, copy controls, and figure zoom work.
- [x] Light, dark, and system themes have accessible contrast.
- [ ] Phone, tablet, desktop, reduced-motion, and print layouts are reviewed.
- [x] Loading, error, global error, empty, and 404 states avoid technical language.

## Discoverability and accessibility

- [x] Titles, descriptions, canonicals, Open Graph, Twitter, and JSON-LD are present.
- [x] RSS, sitemap, and robots use the configured origin.
- [x] Breadcrumb structured data is emitted.
- [x] Keyboard focus remains visible and logical.
- [x] Search status and results are announced by assistive technology.
- [x] Tables, figures, mathematics, code, and footnotes have meaningful semantics.

## Deployment

- [ ] `NEXT_PUBLIC_SITE_URL` is the canonical HTTPS origin.
- [ ] The deployment build runs knowledge generation before Next.js.
- [ ] The build environment supports the pinned Node, pnpm, and DuckDB versions.
- [ ] Representative URLs, 404 behavior, RSS, sitemap, and print preview pass smoke tests.
- [ ] A previous complete deployment is available for rollback.

Version 2 may be released only when every applicable item is checked.
