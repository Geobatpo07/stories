# Sprint 6 — Knowledge Experience

Sprint 6 completes Stories Platform V2. It refines the existing Presentation Layer
without changing the Knowledge Kernel, graph, generated schema, or artifact pipeline.

## UX review

The experience now provides instant global discovery, consistent research navigation,
publication-quality story rendering, a laboratory overview, dark and print themes, and
calm loading, error, empty, and not-found states. Technical subsystem names remain out
of public page copy.

## Search architecture

```text
Platform Runtime entities
  -> createSearchRecords() server projection
  -> minimal serializable SearchRecord[]
  -> search page and global keyboard palette
  -> deterministic local ranking
```

Ranking favors exact and prefix title matches, then titles, tags, summaries, and short
content excerpts. Search supports Programs, Projects, Stories, and Artifacts. It uses no
AI, embedding, external service, generated index, or direct storage access. `Ctrl/Cmd+K`
and `/` open the palette; arrows move, Enter opens, and Escape closes it.

## Navigation review

Every knowledge detail presents its breadcrumb and the available previous, next, parent,
children, and related graph relationships. `ResearchNavigation` and `KnowledgeDiscovery`
replace route-specific navigation layouts. Scientific Questions retain their public
Project label without altering their underlying identity.

## Reading experience

Runtime-provided content is rendered safely through CommonMark, GFM, Remark Math, and
KaTeX. Stories support headings, links, lists, task lists, tables, footnotes, references,
code blocks with copy controls, mathematical notation with MathML, figures, captions,
zoom, citations, contents, progress, and previous/next reading. KaTeX is rendered on the
server and requires no client mathematics runtime.

Typography targets a readable measure and generous vertical rhythm. Tables and equations
scroll locally on narrow screens. The contents list becomes a native disclosure on tablet
and mobile. Figures lazy-load through Next Image and open in a native dialog.

## Accessibility report

- Persistent skip link and visible keyboard focus.
- Semantic header, navigation, main, article, aside, footer, figure, table, and time elements.
- Native dialog behavior for search and figure enlargement, with Escape dismissal.
- Search live result counts, arrow/Enter navigation, and meaningful empty results.
- Named progressbar, table scroll region, code block, and research navigation.
- KaTeX HTML plus MathML output for visual and assistive mathematics.
- Footnote backlinks supplied by the Markdown pipeline.
- Reduced-motion, high-contrast light/dark palettes, mobile reflow, and print cleanup.

## SEO report

Runtime entities continue to supply titles, summaries, dates, tags, scholarly JSON-LD,
RSS, and sitemap records. Runtime manifest metadata now supplies the platform version and
knowledge build timestamp in root metadata. Breadcrumbs emit `BreadcrumbList` JSON-LD.
Canonical URLs, Open Graph, Twitter metadata, robots, and the Version 2 generator value
use the configured public origin.

## Performance report

- All knowledge routes are statically generated; story filters run against a minimized
  client projection rather than opening DuckDB after deployment.
- The Runtime and laboratory snapshot are memoized for each build process.
- KaTeX renders during static generation.
- Search performs local deterministic ranking over compact records.
- Figures use Next Image responsive sizing and lazy loading.
- Client JavaScript is limited to search, story filters, themes, progress, copying, and zoom.
- Transitions are CSS-only and disabled under reduced-motion preferences.

## Technical debt

- Search records are serialized into the shared layout. This is appropriate for the
  current personal laboratory; measure payload size as the collection grows and move to
  the existing `SearchPort` when needed.
- Story authorship is not a first-class Runtime field; the related Program research lead
  remains the best available public attribution.
- The current graph has few direct Story-to-Project and Artifact-to-Story relationships,
  so some discovery groups are correctly empty until authored data supplies those edges.
- Standalone image, notebook, and video entities do not exist in the current domain.
- Social preview images are not generated because the artifact model supplies none.
- Draft status is descriptive rather than access control; the build input determines
  what is public.

These are content-contract limitations or scale triggers, not reasons to add architecture
inside the Presentation Layer.

## Version 2 operations

See:

- `docs/operations/DEVELOPER-WORKFLOW.md`
- `docs/operations/KNOWLEDGE-AUTHORING.md`
- `docs/operations/DEPLOYMENT.md`
- `docs/release/V2-RELEASE-CHECKLIST.md`
- `docs/release/V2-RELEASE-NOTES.md`
