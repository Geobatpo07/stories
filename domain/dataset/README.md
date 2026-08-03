# domain/dataset — Dataset

Data produced or consumed by the lab's research — the data counterpart to a Publication
or piece of Software.

- **Content source:** `content/datasets/*.mdx`
- **Schema:** `schema.ts` — `datasetSchema` extends `baseFrontmatterSchema` with
  optional `sourceUrl` and `license`.
- **Service:** `service.ts` is an empty stub. Not implemented this sprint.

## Extension points

- Provenance fields (collection method, size, format) once a real dataset needs them —
  deliberately not guessed at yet.
- `schema.org/Dataset` JSON-LD generation for open-science discoverability (see the
  platform audit's Open Science findings).
