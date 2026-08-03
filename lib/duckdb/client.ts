import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * DuckDB is a generated analytical index, never the source of truth
 * (see docs/adr/ADR-001.md). This client only knows how to open a
 * connection to that generated file — it has no knowledge of tables,
 * schemas, or indexing logic. That belongs to the Knowledge Artifact
 * Pipeline (`build/`) — see build/README.md.
 *
 * This is a process-lifetime memoized singleton tied to the (readonly,
 * see types/env.d.ts) `DUCKDB_PATH` env var — the right shape for a
 * long-running app process that only ever wants one connection to one
 * configured database. The Build System deliberately does NOT reuse this:
 * it needs an explicit, possibly-per-build/per-test path, so it opens its
 * own `DuckDBInstance` directly (`build/duckdb/connect.ts`) instead.
 */

let instancePromise: Promise<DuckDBInstance> | null = null;

function resolveDatabasePath(): string {
  return process.env.DUCKDB_PATH ?? "./database/generated/knowledge.duckdb";
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
