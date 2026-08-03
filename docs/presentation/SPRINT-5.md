# Sprint 5 — Knowledge Presentation

Sprint 5 turns the generated knowledge snapshot into a public Digital Research
Laboratory. It adds no knowledge-building behavior: pages render immutable data supplied
by the Platform Runtime and never open content files, parse frontmatter, or query DuckDB.

## Website architecture

```text
manifest.json + knowledge.duckdb
  -> ArtifactKnowledgeSourceAdapter
  -> PlatformRuntime / ApplicationContext
  -> lib/presentation (server-only selectors and view projections)
  -> App Router server pages
  -> presentational React components
```

`ArtifactKnowledgeSourceAdapter.create()` validates the manifest contract, verifies the
database SHA-256 checksum, reads the entity and relationship tables once, reconstructs
the existing `KnowledgeGraph`, and closes DuckDB. Its loaded snapshot then satisfies the
existing synchronous `KnowledgeSourcePort`. The Runtime publishes the snapshot and its
build metadata through its immutable `ApplicationContext`.

## Navigation and entity vocabulary

```text
Home
├── Programs -> Program
│   └── Projects, Stories, Artifacts, Related Programs
├── Projects -> Project
│   └── Program, Investigations, Stories, Artifacts
├── Stories -> Story
│   └── Reading document, Previous/Next, Related knowledge
└── Artifacts -> Artifact
    └── Program, Project, Stories, Access links
```

| Public concept | Runtime kind                                         |
| -------------- | ---------------------------------------------------- |
| Program        | `program`                                            |
| Project        | `question`                                           |
| Story          | `note`                                               |
| Artifact       | `publication`, `dataset`, `software`, `presentation` |

Hypotheses and experiments appear inside their Project's investigation record. They are
not promoted into competing top-level directories.

## Routing

| Route                                     | Rendering                                    |
| ----------------------------------------- | -------------------------------------------- |
| `/`                                       | Laboratory overview                          |
| `/programs`, `/programs/[slug]`           | Program directory and record                 |
| `/projects`, `/projects/[slug]`           | Project directory and workspace              |
| `/stories`, `/stories/[slug]`             | Filterable directory and reading view        |
| `/artifacts`, `/artifacts/[kind]/[slug]`  | Artifact directory and collision-safe record |
| `/search`                                 | Runtime-backed knowledge search              |
| `/rss.xml`, `/sitemap.xml`, `/robots.txt` | Discovery endpoints                          |

Detail routes use `generateStaticParams`; directories and content are server-rendered.
Story filters use URL query parameters and a GET form, requiring no client-side state.

## Component tree

```text
SiteShell
├── SiteHeader / PrimaryNavigation / SkipLink
├── Breadcrumb
├── PageHeader or ReadingHeader
├── ProgramCard / ProjectCard / StoryCard / ArtifactCard
├── ContentSection / EntityGrid / RelatedContent
├── MetadataPanel / InformationGrid / StatisticsPanel
├── MarkdownDocument / TableOfContents / StoryNavigation
└── SiteFooter
```

Routes select data. Components receive typed props and only render. Repeated layout,
metadata, card, relationship, and empty-state patterns live in reusable components.

## Relationship rendering

Only Runtime graph edges are rendered. `getParents()` supplies containment,
`getChildren()` supplies attached work, and `getRelated()` supplies contextual links.
Pages group results by public concept and show a quiet empty state when no edge exists.
They never infer or persist a new relationship.

## Accessibility review

- Semantic landmarks, headings, lists, description lists, time elements, and native controls.
- Skip link and visible `:focus-visible` treatment.
- Named primary, breadcrumb, table-of-contents, and previous/next navigation.
- Comfortable reading sizes, restrained line lengths, strong contrast, and text status labels.
- Mobile/tablet reflow, reduced-motion handling, and print styles.

## Performance summary

- Server Components by default; Sprint 5 requires no client component.
- Static params for every knowledge detail route.
- DuckDB is opened once during Runtime bootstrap, materialized, and closed.
- CSS supplies responsive behavior without JavaScript.
- Image optimization remains available when image artifacts enter the Runtime.

## SEO summary

Routes provide titles, descriptions, canonical URLs, Open Graph, and Twitter metadata.
Programs and Projects emit `ResearchProject` JSON-LD; stories emit `ScholarlyArticle`;
artifacts emit the matching scholarly schema. Sitemap, robots, RSS, and structured
breadcrumbs derive their content from Runtime entities.

## Testing and workflow

The suite covers artifact loading and checksum rejection, graph hydration, story filters,
reading projections, route inventory, semantic navigation, component composition, and
responsive/accessibility CSS safeguards. Existing Kernel, Runtime, and Build tests remain.

```bash
pnpm build:knowledge
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Run `build:knowledge` whenever source knowledge changes. The website fails loudly on a
missing artifact, invalid manifest, count mismatch, or checksum mismatch; it never
rebuilds knowledge automatically.

## Future extension points

Sprint 6 may implement the existing `SearchPort` and replace `/search`. New build targets
can add generated discovery artifacts through the current registry. Authentication,
recommendations, embeddings, comments, editing, administration, and graph visualization
remain out of scope.
