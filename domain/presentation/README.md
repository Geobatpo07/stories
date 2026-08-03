# domain/presentation — Presentation

A talk, poster, or seminar given about the lab's work — the spoken/visual counterpart to
a Publication.

- **Content source:** `content/presentations/*.mdx`
- **Schema:** `schema.ts` — `presentationSchema` extends `baseFrontmatterSchema` with
  optional `venue`, `slidesUrl`, `videoUrl`, `programSlug`, `questionSlug`. `date` doubles
  as the event date.
- **Service:** `service.ts` — a thin wrapper over the Knowledge Kernel's
  `loadPresentations()` / `findBySlug()` / `findRelated()`.

## Extension points

- `schema.org/PresentationDigitalDocument` or `Event` JSON-LD generation for open-science
  discoverability, following the same pattern proposed for Publication/Dataset.
- Co-presenter attribution, following Publication's `coAuthors` convention, once a
  presentation needs more than one credited speaker.
