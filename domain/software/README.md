# domain/software — Software

A tool, library, or pipeline produced by the lab (e.g. SmartDedup) — the code
counterpart to a Publication or Dataset.

- **Content source:** `content/software/*.mdx`
- **Schema:** `schema.ts` — `softwareSchema` extends `baseFrontmatterSchema` with
  optional `repositoryUrl` and `license`.
- **Service:** `service.ts` — a thin wrapper over the Knowledge Kernel's
  `loadSoftware()` / `findBySlug()` / `findRelated()`.

## Extension points

- Cross-link to the Experiments or Knowledge Objects that used this software, once
  reverse-reference lookups exist (likely via the DuckDB index).
- Version/release metadata if the platform starts tracking software releases explicitly.
