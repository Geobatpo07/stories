# Knowledge authoring

Stories Platform V3 uses canonical Knowledge Objects as its source of truth. The private
Knowledge Authoring Studio creates and edits those objects; MDX is generated only when an
object is published.

## Start the Studio

Start the Python API and Next.js together (see `DEVELOPER-WORKFLOW.md`), then open `/studio`
and sign in. Development mode enables the Studio locally. In production it is unavailable unless
`STORIES_STUDIO_ENABLED=true` is set on the Python service. Drafts are stored in Supabase and
publication is a GitHub commit, so no writable local filesystem is needed.

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
2. **Draft:** every edit autosaves the canonical object to Supabase (`persistence_records`,
   namespace `knowledge`) through the Python API. Partial drafts are allowed and display
   friendly validation guidance.
3. **Validate:** the Python authoring definitions apply the registered schema and
   normalization. Relationships are selected visually from published objects.
4. **Preview:** narrative content is rendered through the same `MarkdownDocument` component
   used by the public Story experience.
5. **Publish:** `MDXRenderer` generates deterministic MDX, and the API commits it to the
   configured GitHub branch (`GITHUB_REPOSITORY`, `GITHUB_PUBLISH_BRANCH`) in one atomic commit.
6. **Deploy:** Vercel builds the commit; the Python knowledge build regenerates DuckDB and the
   manifest. The API then asks Next.js to revalidate affected paths (best effort).
7. **Version:** the commit is the version. Git remains the official publication history.

## Dynamic forms

The Python authoring definitions (`GET /api/authoring/definitions`) describe every registered
document kind: required state, defaults, enum choices, arrays, dates, URLs, and text controls.
Relationship fields come from the registration metadata. The UI never declares a Program,
Project, Story, or Artifact form manually.

Adding a registered schema automatically produces a form; validation remains owned by the
schema.

## Drafts and validation

Drafts may be incomplete. Autosave therefore persists first and reports validation separately.
Raw Zod errors never reach the UI. Publication requires a fully valid object and relationships
that resolve to published canonical objects.

The schema `status` describes the research lifecycle (`draft`, `active`, `paused`, or
`concluded`). Canonical `publicationState` independently records whether MDX was published.

## Rendering and MDX generation

`KnowledgeRenderer` is the format-neutral renderer contract. Only `MDXRenderer`
(`backend/authoring/renderer.py`) is registered. Its output is byte-identical to the original
TypeScript renderer.
It validates and normalizes fields, follows schema field order, emits readable YAML, normalizes
line endings, and produces a stable final newline.

Future LaTeX, PDF, HTML, JSON, and BibTeX renderers implement the same contract. They must not
add validation or mutate canonical objects.

## Manual MDX maintenance

Generated files remain deliberately readable. An urgent manual correction is possible, but a
later Studio publication regenerates the file from its canonical Knowledge Object. Apply the
same correction to the canonical object to prevent divergence.
