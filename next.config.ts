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
   * (force-dynamic) routes' Lambda bundles. The root layout reads the
   * knowledge DB via `getLaboratory()`, so any dynamic route crashed with
   * ENOENT on /var/task/database/generated/knowledge.duckdb even though
   * statically generated routes (built and traced together at build time)
   * worked fine.
   *
   * Scoped to "/studio/**" on purpose: only /studio, /studio/login,
   * /studio/reset-password, /studio/documents/[id] and /studio/new/[kind]
   * are force-dynamic and so render the root layout at request time. Every
   * other page is static, and no route under app/api/** imports the DB
   * (they never needed this file). A "/**" glob copied the ~binary into
   * every route's Lambda and triggered Vercel's Function Storage alert.
   */
  outputFileTracingIncludes: {
    "/studio/**": ["./database/generated/**"],
  },
  /**
   * The "/studio/**" include above also matches /api/studio/**, which are
   * thin relays to the Python API and never import the knowledge DB. Drop
   * the file from those two Lambdas (Next matches keys as substrings of
   * the route, and "[id]" would be read as a glob character class).
   */
  outputFileTracingExcludes: {
    "/api/studio/**": ["./database/generated/**"],
  },
};

export default nextConfig;
