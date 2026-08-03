/**
 * database/build-index.ts
 *
 * Prepares the DuckDB analytical index. Today this script only opens
 * (and creates, if missing) the database file — it does not read any
 * content or create any tables yet.
 *
 * DuckDB is downstream of `content/**`: this script is meant to become
 * the place that walks `content/`, validates every file through its
 * `domain/*\/schema.ts`, and loads the result into DuckDB tables for fast
 * querying (search, cross-references, dashboards). None of that exists
 * yet — see docs/adr/ADR-001.md and docs/roadmap for the plan.
 *
 * Run with: pnpm db:index
 */
import { getDuckDBConnection } from "@/lib/duckdb";

async function main(): Promise<void> {
  const connection = await getDuckDBConnection();

  // TODO(next sprint): walk `content/**` via lib/markdown, validate each
  // file against its domain schema, and CREATE/INSERT the corresponding
  // DuckDB tables (see database/migrations/ for where table definitions
  // will live once they exist).

  connection.closeSync();
  console.warn("DuckDB index prepared (no tables yet) at", process.env.DUCKDB_PATH ?? "./database/generated/stories.duckdb");
}

main().catch((error: unknown) => {
  console.error("Failed to prepare DuckDB index:", error);
  process.exitCode = 1;
});
