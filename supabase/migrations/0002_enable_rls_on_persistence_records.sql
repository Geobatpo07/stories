-- Defense in depth: this table is only ever touched server-side, via
-- SupabasePersistenceAdapter using the service_role key (see
-- 0001_persistence_records.sql's trailing comment). service_role bypasses
-- Row Level Security regardless of policies, so this doesn't change how the
-- app behaves — it closes off the table entirely to the anon/authenticated
-- keys, in case either is ever used against this project (directly, from a
-- future client-side call, or from the Supabase dashboard's API playground).
--
-- Run this once in your Supabase project's SQL Editor, after 0001.
alter table persistence_records enable row level security;

-- No policies are added on purpose: zero policies + RLS enabled means the
-- anon and authenticated roles get zero rows, full stop. service_role is
-- exempt from RLS by definition and keeps working unchanged.
