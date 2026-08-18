import { NextResponse, type NextRequest } from "next/server";
import { SupabasePersistenceAdapter } from "@/runtime/adapters/supabase-persistence-adapter";
import { SessionRepository } from "@/auth/repository";
import { SESSION_COOKIE_NAME } from "@/auth/types";

/**
 * Gates `/studio/**` and `/api/studio/**` before any Server Component or
 * Route Handler runs. This is not merely a convenience layer over the
 * per-route/layout checks (`auth/server.ts`'s `getStudioSession()`,
 * `authoring/server.ts`'s `isStudioEnabled()`) — it is load-bearing.
 *
 * Next.js's App Router can start rendering a protected page's data-fetching
 * concurrently with its parent layout, as part of one streamed response.
 * A `redirect()` thrown from `app/studio/(protected)/layout.tsx` alone does
 * not prevent `app/studio/(protected)/page.tsx` from having already fetched
 * and streamed its data into that same response before the redirect lands
 * (verified directly: an unauthenticated `curl` request received the actual
 * knowledge-document list, followed by a `<meta http-equiv="refresh">`
 * redirect tag a browser would honor — the data was already on the wire).
 * Only blocking in Middleware, before rendering begins, closes that gap.
 *
 * Runs on the standard Edge runtime — no `runtime: "nodejs"` override.
 * That was only ever needed because the session store used to be
 * `node:fs`-based; now it's a `fetch` call to Supabase's REST API
 * (`SupabasePersistenceAdapter`), which Edge supports natively. Imports it,
 * and `SessionRepository`, from their own files rather than the
 * `@/runtime`/`@/auth` barrels, deliberately: the `@/runtime` barrel also
 * re-exports `ArtifactKnowledgeSourceAdapter`, which imports the
 * `@duckdb/node-api` native binding at module scope — pulling that into the
 * Middleware bundle for a session check that never needs it (and Edge
 * couldn't run it even if it were pulled in).
 *
 * Reads `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` directly from
 * `process.env` rather than through `EnvironmentConfiguration` (the
 * convention everywhere else — see its doc comment): Next.js's Edge bundler
 * inlines env vars by statically finding literal `process.env.X` reads, and
 * `EnvironmentConfiguration`'s `{...process.env}` spread isn't that.
 */
export const config = {
  matcher: ["/studio/:path*", "/api/studio/:path*"],
};

const PUBLIC_STUDIO_PATHS = ["/studio/login", "/studio/reset-password"];

const sessions = new SessionRepository(
  new SupabasePersistenceAdapter(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    "auth",
  ),
);

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (PUBLIC_STUDIO_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await sessions.get(token) : undefined;
  const valid = session !== undefined && new Date(session.expiresAt).getTime() > Date.now();
  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/studio/login", request.url));
}
