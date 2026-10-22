// Canonical text dump of a knowledge artifact, read with the REAL Node reader (@duckdb/node-api,
// the library ArtifactKnowledgeSourceAdapter uses). Used to diff a TypeScript-built artifact
// against a Python-built one.
//
//   node dump-artifact.mjs <artifact directory> [--tables a,b] [--exclude-file-path] [--physical]
//
// Sections: schema (information_schema + constraints), each requested table in the order the
// adapter reads it (or physical insertion order with --physical), and the manifest with its
// run-dependent fields (generatedAt, generationDuration, artifact checksum) blanked out.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const args = process.argv.slice(2);
const directory = args[0];
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const tables = (option("--tables") ?? "knowledge_entity,knowledge_relationship").split(",");
const excludeFilePath = flag("--exclude-file-path");
const physical = flag("--physical");

const ADAPTER_ORDER = {
  knowledge_entity: "ORDER BY created_at DESC, id ASC",
  knowledge_relationship: "ORDER BY source_id, target_id, field",
};

const instance = await DuckDBInstance.create(join(directory, "knowledge.duckdb"), {
  access_mode: "READ_ONLY",
});
const connection = await instance.connect();
const rows = async (sql) => (await connection.runAndReadAll(sql)).getRowObjectsJson();
const out = [];

out.push("== schema");
const quoted = tables.map((t) => `'${t}'`).join(",");
for (const r of await rows(
  `SELECT table_name, column_name, ordinal_position, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name IN (${quoted}) ORDER BY table_name, ordinal_position`,
)) {
  out.push(JSON.stringify(r));
}
out.push("== constraints");
for (const r of await rows(
  `SELECT table_name, constraint_type, constraint_column_names FROM duckdb_constraints() WHERE table_name IN (${quoted}) ORDER BY table_name, constraint_type`,
)) {
  out.push(JSON.stringify(r));
}
out.push("== table list");
for (const r of await rows(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
)) {
  out.push(r.table_name);
}

for (const table of tables) {
  out.push(`== ${table} (${physical ? "physical order" : "adapter order"})`);
  const columns = (
    await rows(
      `SELECT column_name FROM information_schema.columns WHERE table_name = '${table}' ORDER BY ordinal_position`,
    )
  )
    .map((c) => c.column_name)
    .filter((c) => !(excludeFilePath && c === "file_path"));
  const order = physical ? "" : (ADAPTER_ORDER[table] ?? "");
  for (const r of await rows(`SELECT ${columns.join(", ")} FROM ${table} ${order}`)) {
    out.push(JSON.stringify(r));
  }
}

out.push("== manifest (run-dependent fields blanked)");
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json"), "utf8"));
manifest.generatedAt = "<blank>";
manifest.generationDuration = "<blank>";
if (manifest.artifacts?.knowledgeDatabase)
  manifest.artifacts.knowledgeDatabase.checksum = "<blank>";
out.push(JSON.stringify(manifest, null, 2));

connection.closeSync();
instance.closeSync();
process.stdout.write(`${out.join("\n")}\n`);
