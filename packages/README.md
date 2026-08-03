# packages/

Reserved workspace root (see `pnpm-workspace.yaml`) for code that outgrows living inside
the app — e.g. a `@stories/schemas` package shared with a future CLI, or a `@stories/mdx`
compiler package shared with a documentation site.

Empty until something is actually extracted. Do not pre-create packages speculatively —
promote a module out of `lib/` or `domain/` here only once a second consumer needs it.
