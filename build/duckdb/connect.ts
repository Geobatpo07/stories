import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * The Build Pipeline's own DuckDB connection — deliberately not shared with
 * `lib/duckdb/client.ts`'s read-only, process-lifetime singleton (see that
 * file's doc comment). The build needs a writable instance it fully
 * controls the lifecycle of: open, DROP + CREATE + repopulate, close, all
 * within one target's `run()` call.
 */
export async function connectForBuild(
  databasePath: string,
): Promise<{ instance: DuckDBInstance; connection: DuckDBConnection }> {
  const instance = await DuckDBInstance.create(databasePath);
  const connection = await instance.connect();
  return { instance, connection };
}
