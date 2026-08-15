import { NextResponse } from "next/server";
import { z } from "zod";
import { authWorkflow, writeSessionCookie } from "@/auth/server";

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

/**
 * In-memory only — resets on server restart. Documented simplification for
 * a single-admin tool; see auth/README.md, "What's deliberately not built."
 */
const attempts = new Map<string, { count: number; windowStart: number }>();

function rateLimited(email: string): boolean {
  const now = Date.now();
  const entry = attempts.get(email);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(email, { count: 1, windowStart: now });
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

  if (rateLimited(email)) {
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
  attempts.delete(email);
  return NextResponse.json({ success: true });
}
