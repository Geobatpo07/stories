# Knowledge authoring

Knowledge is authored under `content/` and validated by the existing domain schemas. A
published page never reads these files directly; `pnpm build:knowledge` compiles them into
the manifest and DuckDB snapshot consumed by the Runtime.

## Public organization

| Source kind                                  | Public experience     |
| -------------------------------------------- | --------------------- |
| Program                                      | Research Program      |
| Question                                     | Project               |
| Note                                         | Story                 |
| Publication, Dataset, Software, Presentation | Artifact              |
| Hypothesis, Experiment                       | Project investigation |

Use slugs as stable public identifiers. Changing a slug changes its URL and every
relationship that targets it. Titles may evolve without changing identity.

## Story formatting

Stories support CommonMark and GitHub-flavored tables, task lists, links, strikethrough,
and footnotes. Additional scientific patterns:

```markdown
Inline mathematics: $u_t + f(u)_x = 0$.

$$
u_i^{n+1} = \frac{1}{2}(u_{i+1}^n + u_{i-1}^n)
$$

![Radial velocity profile](/images/radial-profile.png "Figure 1. Baseline radial profile")

The result follows the baseline study.[^baseline]

[^baseline]: Author, “Study title,” venue, year.
```

Use meaningful alternative text that communicates what a figure contributes. The image
title becomes its visible caption. Put downloadable local images in `public/images/` and
optimize their dimensions and compression before committing them.

Fenced code blocks should declare a language. Tables require descriptive surrounding
text and concise column headings. Use a `References` heading for bibliographies and
footnotes for claims that need local citation context.

## Relationships

Use only schema-supported slug fields. Relationships are validated during the knowledge
build and rendered in both directions through the Knowledge Graph. Do not manually copy
“related content” lists into page components.

Draft content remains visible if present in the generated snapshot because the current
domain contract treats status as research context, not authorization. Remove content
from the public build input if it must not be published.
