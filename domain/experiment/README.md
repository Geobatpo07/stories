# domain/experiment — Experiment

A single, falsifiable test: setup, result, interpretation. Smaller-grained than a
Research Note; the atomic unit of "did this work."

- **Content source:** `content/experiments/*.mdx`
- **Schema:** `schema.ts` — `experimentSchema` extends `baseFrontmatterSchema` with
  `questionSlug` and optional `hypothesisSlug`.
- **Service:** `service.ts` is an empty stub. Not implemented this sprint.

## Extension points

- An `outcome` field (e.g. `"supported" | "refuted" | "inconclusive"`) once real
  experiments need to report a result — deliberately left out for now rather than
  guessed at.
- Linking to reproducibility artifacts (code, data) — likely a reference to a Software
  or Dataset slug, following the same `*Slug` convention as `questionSlug`.
