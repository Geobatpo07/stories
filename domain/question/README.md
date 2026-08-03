# domain/question — Scientific Question

A specific, open question within a Research Program. Hypotheses and Experiments
reference a Question by slug.

- **Content source:** `content/questions/*.mdx`
- **Schema:** `schema.ts` — `questionSchema` extends `baseFrontmatterSchema` with
  `programSlug`.
- **Service:** `service.ts` is an empty stub. Not implemented this sprint.

## Extension points

- Validate `programSlug` actually resolves to an existing program (cross-collection
  referential integrity) — a natural job for the DuckDB index once it exists, rather
  than a runtime check on every read.
- Track question state beyond `status` (open / answered / abandoned) if `draft / active /
  paused / concluded` proves too coarse.
