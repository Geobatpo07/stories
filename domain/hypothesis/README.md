# domain/hypothesis — Hypothesis

A falsifiable claim proposed in service of a Scientific Question, tested by one or more
Experiments.

- **Content source:** `content/hypotheses/*.mdx`
- **Schema:** `schema.ts` — `hypothesisSchema` extends `baseFrontmatterSchema` with
  `questionSlug`.
- **Service:** `service.ts` — a thin wrapper over the Knowledge Kernel's
  `loadHypotheses()` / `findBySlug()` / `findRelated()`.

## Extension points

- Track a hypothesis's outcome (`supported | refuted | inconclusive`) once real
  Experiments report results back to the Hypothesis they tested — likely surfaced via
  the Knowledge Graph's incoming edges rather than a new frontmatter field.
