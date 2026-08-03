# components/research

Presentational components for the research surfaces: Research Programs, Scientific
Questions, Hypotheses, Experiments — cards, timelines, status badges, thread views.

Empty at foundation stage. When populated, these components render data shaped by
`domain/*/types.ts`; they must not import `lib/duckdb` or `lib/markdown` directly, and
must not contain fetching or business logic (see docs/architecture/Architecture.md,
"No business logic inside React components").
