# domain/knowledge — Knowledge Object

The general-purpose notebook entry. Rather than one domain module per editorial format
(Research Note, Dev Log, Reading Note, Tutorial, Conference Note, Book Review, Essay),
these share one `KnowledgeObject` shape distinguished by a `noteType` enum — they have
the same lifecycle (`status`, `tags`, optional `programSlug`) and differ only in editorial
convention, not in data shape.

- **Content source:** `content/notes/*.mdx`
- **Schema:** `schema.ts` — `knowledgeSchema` extends `baseFrontmatterSchema` with
  `noteType` and optional `programSlug`.
- **Service:** `service.ts` — a thin wrapper over the Knowledge Kernel's
  `loadKnowledgeObjects()` / `findBySlug()` / `findRelated()`, plus `listResearchNotes()`
  / `listTutorials()` delegating to the Kernel's `loadResearchNotes()` / `loadTutorials()`
  filtered views (see "Notes vs Tutorial" in `kernel/README.md` for why these stay
  filtered views over one collection rather than separate schemas).

## Extension points

- If one `noteType` (e.g. Reading Note) grows fields the others don't need — a `citation`
  object, say — reconsider splitting it into its own domain module rather than piling
  optional fields onto the shared schema.
- Per-type body templates (Context → Question → Method → Findings → …) are an editorial
  convention enforced by author discipline or a future `scripts/new-note` generator, not
  by this schema — the schema validates frontmatter, not MDX body structure.
