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
  // middleware.ts declares `runtime: "nodejs"` (its session store needs
  // node:fs) — still experimental in Next.js 15.5, gated behind this flag.
  // Without it, the middleware manifest silently ends up empty and no
  // Studio route actually gets gated in a production build. Next.js 15.5's
  // shipped `ExperimentalConfig` type hasn't caught up to this runtime-
  // recognized flag yet (confirmed working: `next build` logs
  // "✓ nodeMiddleware" under Experiments) — remove the suppression once it has.
  // @ts-expect-error -- nodeMiddleware is a real, recognized experimental flag; only the type declarations lag.
  experimental: { nodeMiddleware: true },
};

export default nextConfig;
