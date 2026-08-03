# lib/search

Reserved for the search abstraction over indexed content (candidates: DuckDB full-text
search against `database/generated`, or an in-memory index such as MiniSearch built at
startup). No implementation yet — depends on `database/build-index.ts` actually indexing
something first.
