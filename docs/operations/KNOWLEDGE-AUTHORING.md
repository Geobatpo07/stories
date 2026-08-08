# Knowledge authoring

Stories Platform V3 uses canonical Knowledge Objects as its source of truth. The private
Knowledge Authoring Studio creates and edits those objects; MDX is generated only when an
object is published.

## Start the Studio

Run `pnpm dev` and open `/studio`. Development mode enables the Studio locally. Public
production deployments keep it unavailable unless `STORIES_STUDIO_ENABLED=true` is set.
Only enable it in an access-controlled environment with a durable writable filesystem.

## Public organization

| Studio concept | Kernel kind                                          | Publication directory        |
| -------------- | ---------------------------------------------------- | ---------------------------- |
| Program        | `program`                                            | `content/programs/`          |
| Project        | `question`                                           | `content/questions/`         |
| Story          | `note`                                               | `content/notes/`             |
| Artifact       | `software`, `publication`, `dataset`, `presentation` | corresponding content folder |

Hypotheses and experiments remain Project investigations in the underlying Knowledge Model.

## Knowledge Object lifecycle

1. **Create:** the Studio creates a private object with a UUID and schema defaults.
2. **Draft:** every edit autosaves canonical JSON under `knowledge/<kind>/`. Partial drafts
   are allowed and display friendly validation guidance.
3. **Validate:** the Kernel applies the registered Zod schema, normalization, and closed-world
   relationship resolution. Relationships are selected visually from published objects.
4. **Preview:** narrative content is rendered through the same `MarkdownDocument` component
   used by the public Story experience.
5. **Publish:** `MDXRenderer` generates deterministic MDX in the existing registered content
   folder. The Knowledge Artifact Pipeline regenerates DuckDB and the manifest.
6. **Refresh:** Runtime and presentation caches are invalidated and affected Next.js paths are
   revalidated without restarting the Studio.
7. **Version:** commit canonical JSON and generated MDX together. Git remains the official
   publication history.

## Dynamic forms

The Kernel authoring API walks every registered Zod object shape. It derives required state,
defaults, enum choices, arrays, dates, URLs, and text controls. Relationship fields come from
the existing Kernel registration metadata. The UI never declares a Program, Project, Story,
or Artifact form manually.

Adding a registered schema automatically produces a form. Use Zod `.describe()` metadata when
a field needs author-facing guidance; validation remains owned by the schema.

## Drafts and validation

Drafts may be incomplete. Autosave therefore persists first and reports validation separately.
Raw Zod errors never reach the UI. Publication requires a fully valid object and relationships
that resolve to published canonical objects.

The schema `status` describes the research lifecycle (`draft`, `active`, `paused`, or
`concluded`). Canonical `publicationState` independently records whether MDX was published.

## Rendering and MDX generation

`KnowledgeRenderer` is the format-neutral renderer contract. V3 registers only `MDXRenderer`.
It validates and normalizes fields, follows schema field order, emits readable YAML, normalizes
line endings, and produces a stable final newline.

Future LaTeX, PDF, HTML, JSON, and BibTeX renderers implement the same contract. They must not
add validation or mutate canonical objects.

## Manual MDX maintenance

Generated files remain deliberately readable. An urgent manual correction is possible, but a
later Studio publication regenerates the file from its canonical Knowledge Object. Apply the
same correction to the canonical object to prevent divergence.
