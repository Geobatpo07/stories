import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Read from disk relative to this module's own location — not `process.cwd()`
 * — so it resolves correctly regardless of which directory a caller (the CLI,
 * a test with a temporary `rootDirectory`) runs from.
 */
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(resolve(moduleDirectory, "..", "package.json"), "utf8"),
) as { version: string };

export const PLATFORM_VERSION = packageJson.version;

/**
 * The Kernel, the Build Pipeline, and the frontmatter schema vocabulary each
 * version independently of the platform release. No consumer depends on
 * these tracking anything but themselves yet — bump deliberately when one of
 * the three changes shape in a way `ArtifactKnowledgeSourceAdapter` cares about.
 */
export const KERNEL_VERSION = "1.0.0";
export const BUILD_VERSION = "1.0.0";
export const SCHEMA_VERSION = "1.0.0";
