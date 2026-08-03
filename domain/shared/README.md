# domain/shared

The shared kernel: cross-cutting types used by more than one domain module
(`EntityRef`, `Result`). Not an entity module itself — no `schema.ts` or
`service.ts`, because it models no content collection.

**Rule:** if a type is used by exactly one domain module, it lives in that
module's `types.ts`, not here. Promote a type to `domain/shared` only once
a second module needs it — the same discipline as `packages/`.
