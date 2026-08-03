# domain/hypothesis — Hypothesis

A falsifiable claim proposed in service of a Scientific Question, tested by one or more
Experiments.

## Open question — no content collection yet

`content/` has no `hypotheses/` folder. This module exists (types, schema, service) so
the domain model is complete, but it is genuinely unresolved whether a Hypothesis should:

1. Get its own `content/hypotheses/*.mdx` collection, referenced by `questionSlug`, or
2. Live as a structured array *inside* a Question's or Experiment's frontmatter, with no
   standalone file.

Option 2 avoids a proliferation of one-paragraph files for what might just be a sentence;
option 1 keeps every entity independently citable and linkable, matching the rest of the
model. **Decide this before writing the first real hypothesis** — see
docs/architecture/Architecture.md, "Open questions."
