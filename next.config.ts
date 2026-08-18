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
};

export default nextConfig;
