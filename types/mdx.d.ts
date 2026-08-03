/**
 * Ambient declaration kept for a future sprint that may render `.mdx`
 * files as React components directly (Next's file-extension MDX
 * pipeline). Today, content under `content/**` is read as data via
 * `lib/markdown`, not imported as a module — see docs/adr/ADR-001.md.
 */
declare module "*.mdx" {
  import type { ComponentType } from "react";

  const MDXComponent: ComponentType;
  export default MDXComponent;
}
