# domain/program — Research Program

The top-level container of the knowledge model. A Research Program is a standing
research direction (e.g. "Environmental & Climate Modeling") that Questions,
Experiments, and Knowledge Objects attach to.

- **Content source:** `content/programs/*.mdx`
- **Schema:** `schema.ts` — `programSchema` extends the shared `baseFrontmatterSchema`
  with `theme`, `leadResearcher`, `relatedQuestionSlugs`.
- **Service:** `service.ts` is an empty stub. Not implemented this sprint.

## Extension points

- List/resolve operations (`listPrograms`, `getProgramBySlug`) once a route needs them.
- Aggregation across Questions/Experiments/Notes tagged to a program (likely served from
  the DuckDB index once `database/build-index.ts` actually indexes content).
- `leadResearcher` becoming a reference type once there is more than one contributor.
