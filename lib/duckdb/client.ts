import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * DuckDB is a generated analytical index, never the source of truth
 * (see docs/adr/ADR-001.md). This client only knows how to open a
 * connection to that generated file — it has no knowledge of tables,
 * schemas, or indexing logic. That belongs in `database/build-index.ts`
 * and the migrations that will follow it.
 */

let instancePromise: Promise<DuckDBInstance> | null = null;

function resolveDatabasePath(): string {
  return process.env.DUCKDB_PATH ?? "./database/generated/stories.duckdb";
}

function getInstance(): Promise<DuckDBInstance> {
  instancePromise ??= DuckDBInstance.create(resolveDatabasePath());
  return instancePromise;
}

/** Open (creating the database file if missing) and return a DuckDB connection. */
export async function getDuckDBConnection(): Promise<DuckDBConnection> {
  const instance = await getInstance();
  return instance.connect();
}
