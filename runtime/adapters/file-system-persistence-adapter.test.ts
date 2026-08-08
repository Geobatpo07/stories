import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileSystemPersistenceAdapter } from "./file-system-persistence-adapter";

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);

describe("FileSystemPersistenceAdapter", () => {
  it("saves, lists, loads, and deletes deterministic JSON records", async () => {
    const root = mkdtempSync(join(tmpdir(), "stories-knowledge-"));
    directories.push(root);
    const adapter = new FileSystemPersistenceAdapter(root);
    await adapter.save("note", "one", { title: "One" });
    await adapter.save("note", "two", { title: "Two" });
    await expect(adapter.load("note", "one")).resolves.toEqual({ title: "One" });
    await expect(adapter.list("note")).resolves.toEqual([{ title: "One" }, { title: "Two" }]);
    await adapter.delete("note", "one");
    await expect(adapter.load("note", "one")).resolves.toBeUndefined();
  });

  it("rejects paths that are not safe knowledge identifiers", async () => {
    const root = mkdtempSync(join(tmpdir(), "stories-knowledge-"));
    directories.push(root);
    const adapter = new FileSystemPersistenceAdapter(root);
    await expect(adapter.save("../outside", "record", {})).rejects.toThrow(
      "Invalid persistence collection",
    );
  });
});
