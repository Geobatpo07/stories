-- Generic key-value store backing runtime/adapters/supabase-persistence-adapter.ts's
-- PersistencePort implementation. One table for every collection this platform persists
-- server-side (Studio auth: credentials/sessions/reset tokens; Studio drafts: canonical
-- Knowledge Objects) — namespace + collection + id mirrors FileSystemPersistenceAdapter's
-- root/collection/filename layout exactly, so no per-entity-kind tables are needed.
--
-- Run this once in your Supabase project's SQL Editor. Never applied automatically —
-- there is no tooling in this repo with direct access to your Supabase project.
create table if not exists persistence_records (
  namespace text not null,
  collection text not null,
  id text not null,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (namespace, collection, id)
);

-- Accessed only server-side, via the service_role key (which bypasses Row Level Security
-- entirely) — never from a browser or an anon key. See 0002_enable_rls_on_persistence_records.sql,
-- which turns RLS on with zero policies as defense in depth against the anon/authenticated keys.
