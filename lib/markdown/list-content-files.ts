import { readdirSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_EXTENSIONS = [".mdx", ".md"] as const;

/**
 * List absolute paths of content files in a `content/<collection>` directory.
 * Pure filesystem listing — no parsing, no validation.
 */
export function listContentFiles(
  directory: string,
  extensions: readonly string[] = DEFAULT_EXTENSIONS,
): string[] {
  return readdirSync(directory)
    .filter((file) => extensions.some((extension) => file.endsWith(extension)))
    .map((file) => join(directory, file));
}
