import packageJson from "../package.json";

/**
 * A static import (not a runtime `readFileSync` off `import.meta.url`) so
 * bundlers inline the value at build time. The dynamic-path version of this
 * read `resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json")`
 * at runtime — Next's webpack rewrites `import.meta.url` in server bundles to
 * a literal build-container path (e.g. `/vercel/path0/...`), which doesn't
 * exist in the deployed Lambda's runtime filesystem, so every route that
 * transitively imported PLATFORM_VERSION crashed with ENOENT in production
 * even though it worked in every local build.
 */
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
