import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { PersistencePort } from "../ports/types";

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;

/** JSON-file persistence for the private, local Authoring Studio. */
export class FileSystemPersistenceAdapter implements PersistencePort {
  private readonly root: string;

  constructor(root = "knowledge") {
    this.root = resolve(root);
  }

  async save<T>(collection: string, id: string, value: T): Promise<void> {
    const directory = this.collectionPath(collection);
    await mkdir(directory, { recursive: true });
    await writeFile(this.itemPath(collection, id), `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }

  async load<T>(collection: string, id: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(this.itemPath(collection, id), "utf8")) as T;
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  async list<T>(collection: string): Promise<readonly T[]> {
    const directory = this.collectionPath(collection);
    let files: string[];
    try {
      files = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const records = await Promise.all(
      files
        .filter((file) => file.endsWith(".json"))
        .sort()
        .map(async (file) => JSON.parse(await readFile(join(directory, file), "utf8")) as T),
    );
    return records;
  }

  async delete(collection: string, id: string): Promise<void> {
    try {
      await unlink(this.itemPath(collection, id));
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }

  private collectionPath(collection: string): string {
    assertSegment(collection, "collection");
    return this.withinRoot(resolve(this.root, collection));
  }

  private itemPath(collection: string, id: string): string {
    assertSegment(id, "id");
    return this.withinRoot(resolve(this.collectionPath(collection), `${id}.json`));
  }

  private withinRoot(path: string): string {
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error("Persistence path must remain inside the configured knowledge directory.");
    }
    return path;
  }
}

function assertSegment(value: string, label: string): void {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid persistence ${label}.`);
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
