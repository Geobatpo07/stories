# Canonical knowledge objects (legacy location)

Studio drafts no longer live here. `authoring/server.ts` now persists canonical Knowledge
Objects through `SupabasePersistenceAdapter` (`namespace: "knowledge"` in Supabase's
`persistence_records` table — see `runtime/adapters/supabase-persistence-adapter.ts` and
`auth/README.md`'s "Storage" section), not `FileSystemPersistenceAdapter` writing JSON
files under this directory. Vercel's serverless functions can't write to a local
filesystem outside `/tmp`, so a durable, network-reachable store replaced this one.

Any `*.json` file still sitting under here predates that migration and is no longer read by
the Studio — safe to ignore, or remove once you've confirmed you don't need it.

`runtime/adapters/file-system-persistence-adapter.ts` itself is unchanged and still used
directly in tests (`auth/workflow.test.ts`, `authoring/workflow.test.ts`), which only
exercise the `PersistencePort` contract against a temporary directory, never this one.
