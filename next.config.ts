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
   * build/version.ts reads the project's root package.json at runtime via a
   * path built from `import.meta.url` (not a string literal), so Vercel's
   * Output File Tracing can't statically detect it and drops package.json
   * from some routes' deployed Lambda bundles — causing an ENOENT crash at
   * request time on routes that transitively import PLATFORM_VERSION (e.g.
   * /studio/login, /studio/reset-password) while others happen to keep it.
   * Force it into every route's trace explicitly.
   */
  outputFileTracingIncludes: {
    "/**": ["./package.json"],
  },
};

export default nextConfig;
