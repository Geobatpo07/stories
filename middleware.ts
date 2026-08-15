import { NextResponse, type NextRequest } from "next/server";
import { FileSystemPersistenceAdapter } from "@/runtime/adapters/file-system-persistence-adapter";
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
 * Runs on the Node.js Middleware runtime (stable since Next.js 15.2), not
 * the default Edge runtime — the session store is `node:fs`-based. Imports
 * `FileSystemPersistenceAdapter` and `SessionRepository` from their own
 * files rather than the `@/runtime`/`@/auth` barrels, deliberately: the
 * `@/runtime` barrel re-exports `ArtifactKnowledgeSourceAdapter`, which
 * imports the `@duckdb/node-api` native binding at module scope — pulling
 * that into the Middleware bundle for a session check that never needs it.
 */
export const config = {
  runtime: "nodejs",
  matcher: ["/studio/:path*", "/api/studio/:path*"],
};

const PUBLIC_STUDIO_PATHS = ["/studio/login", "/studio/reset-password"];

const sessions = new SessionRepository(new FileSystemPersistenceAdapter(".studio-auth"));

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
