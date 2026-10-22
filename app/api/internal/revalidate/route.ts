import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

/**
 * Service-to-service endpoint: the Python Studio API (backend/publication/revalidate.py) calls it
 * after a publication, because only Next.js can call `revalidatePath`. Not a user route — it is
 * authenticated by a shared secret, never by the Studio session cookie, and `middleware.ts` does
 * not match it.
 *
 * `REVALIDATE_SECRET` must be set to the same value here and in the Python service (same
 * convention as `SUPABASE_SERVICE_ROLE_KEY`; see .env.example). It is compared in constant time:
 * both sides are hashed first so the buffers have equal length and `timingSafeEqual` never throws
 * or leaks the secret's length.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (provided === null) return false;
  const left = createHash("sha256").update(provided).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Revalidation is not configured." }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-revalidate-secret"), expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ revalidated: true });
}
