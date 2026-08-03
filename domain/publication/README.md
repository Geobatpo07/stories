# domain/publication — Publication

A formal scholarly output: paper, preprint, or conference proceeding.

- **Content source:** `content/publications/*.mdx`
- **Schema:** `schema.ts` — `publicationSchema` extends `baseFrontmatterSchema` with
  optional `venue`, `doi`, `preprintUrl`, and `coAuthors`.
- **Service:** `service.ts` is an empty stub. Not implemented this sprint.

## Extension points

- BibTeX generation from frontmatter (`citeAs`) — see the platform audit's SEO findings
  on academic discoverability.
- `citation_*` meta tag rendering for Google Scholar indexing.
- ORCID reference once contributor identity is modeled beyond a plain string.
