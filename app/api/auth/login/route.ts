import { NextResponse } from "next/server";
import { z } from "zod";
import { authWorkflow, writeSessionCookie } from "@/auth/server";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * In-memory only — resets on server restart. Documented simplification for
 * a single-admin tool; see auth/README.md, "What's deliberately not built."
 *
 * Keyed by client IP, never by the submitted email: an email-keyed counter
 * lets anyone who knows the admin's address send 11 bad logins and lock the
 * real admin out for the whole window, from anywhere. Keyed by IP, an
 * attacker can only exhaust their own bucket.
 *
 * The IP is trusted only on Vercel (`VERCEL=1`), where the edge network sets
 * `x-real-ip` itself (the header `@vercel/functions`' `ipAddress()` reads;
 * Vercel documents it as identical to `x-forwarded-for`, which it overwrites
 * rather than appends to). Anywhere else a client could send that header
 * itself and dodge the limit by rotating it, so it is ignored. When no
 * trustworthy IP exists: in development the limiter is skipped (nobody
 * remote is attacking localhost); in production everyone shares one
 * fail-closed bucket, so brute force stays throttled. That bucket can also
 * lock the admin out, so a production host without a trusted IP should not
 * serve this route. A proxy in front of Vercel hides the real client IP the
 * same way (every request would share the proxy's IP).
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

const UNIDENTIFIED_CLIENT = "unidentified-client";

function clientKey(request: Request): string | undefined {
  if (process.env.VERCEL === "1") {
    const ip = request.headers.get("x-real-ip")?.trim();
    if (ip) return ip;
  }
  return process.env.NODE_ENV === "production" ? UNIDENTIFIED_CLIENT : undefined;
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const key = clientKey(request);
  if (key !== undefined && rateLimited(key)) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in a few minutes." },
      { status: 429 },
    );
  }

  const result = await authWorkflow.login(email, password);
  if (!result.success || !result.sessionToken || !result.expiresAt) {
    return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
  }

  await writeSessionCookie(result.sessionToken, result.expiresAt);
  if (key !== undefined) attempts.delete(key);
  return NextResponse.json({ success: true });
}
