import type { NextConfig } from "next";

/**
 * Content under `content/**` is not compiled through Next's page-extension
 * MDX pipeline — it is read and validated by `lib/markdown` and, later,
 * rendered explicitly by the routes that need it. See docs/adr/ADR-001.md.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  serverExternalPackages: ["@duckdb/node-api", "@duckdb/node-bindings"],
  images: { remotePatterns: [{ protocol: "https", hostname: "**" }] },
  /**
   * database/generated/{knowledge.duckdb,manifest.json} are binary/generated
   * build artifacts opened by a native DuckDB binding at runtime, not
   * `require()`/`import()`-ed — Vercel's Output File Tracing can't detect
   * that read statically, so it drops them from dynamically-rendered
   * (force-dynamic) routes' Lambda bundles. Every route shares the root
   * layout, which reads the knowledge DB via `getLaboratory()`, so any
   * dynamic route (e.g. /studio/login) crashed with ENOENT on
   * /var/task/database/generated/knowledge.duckdb even though statically
   * generated routes (built and traced together at build time) worked fine.
   */
  outputFileTracingIncludes: {
    "/**": ["./database/generated/**"],
  },
};

export default nextConfig;
