import type * as Support from "@/app/api/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/auth/passwords";

// Characterization of POST /api/auth/login (ADR-004 Phase 4 step 1, backend/PHASE4-AUDIT.md).
// Pins today's behaviour, quirks included, so a reimplementation that diverges fails here.
vi.mock("next/headers", async () => (await import("@/app/api/test-support")).nextHeadersMock);
vi.mock(
  "@/runtime/adapters/supabase-persistence-adapter",
  async () => (await import("@/app/api/test-support")).supabaseAdapterMock,
);
vi.mock(
  "@/runtime/adapters/resend-email-adapter",
  async () => (await import("@/app/api/test-support")).resendAdapterMock,
);

const NOW = new Date("2026-08-15T12:00:00.000Z");
const TTL_12H = new Date("2026-08-16T00:00:00.000Z");

// The route keeps its attempt counter in module scope, so every test gets a fresh module graph.
async function load() {
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const route = await import("./route");
  await support.seedAdmin(NOW);
  return { support, POST: route.POST };
}

function login(support: typeof Support, body: unknown, ip: string | null = "203.0.113.1") {
  const request = support.jsonRequest("http://localhost/api/auth/login", body);
  if (ip !== null) request.headers.set("x-real-ip", ip);
  return request;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VERCEL", "1");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/login: success", () => {
  it("answers 200 {success:true} and sets exactly one session cookie", async () => {
    const { support, POST } = await load();
    const response = await POST(
      login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(support.setCookieHeaders()).toHaveLength(1);
  });

  it("serializes the cookie as HttpOnly, SameSite=lax, Path=/, expiring 12 h after login", async () => {
    const { support, POST } = await load();
    await POST(login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }));
    const [header] = support.setCookieHeaders();
    expect(header).toMatch(/^stories_studio_session=[0-9a-f]{64}; /);
    expect(header).toBe(
      `stories_studio_session=${header!.split("=")[1]!.split(";")[0]}; Path=/; Expires=${TTL_12H.toUTCString()}; HttpOnly; SameSite=lax`,
    );
  });

  it("adds Secure only when NODE_ENV is production (Next serializes it before HttpOnly)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { support, POST } = await load();
    await POST(login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }));
    const [header] = support.setCookieHeaders();
    expect(header).toMatch(
      new RegExp(
        `^stories_studio_session=[0-9a-f]{64}; Path=/; Expires=${TTL_12H.toUTCString()}; Secure; HttpOnly; SameSite=lax$`,
      ),
    );
  });

  it("persists one session row whose id, token and cookie value are the same 64-hex string", async () => {
    const { support, POST } = await load();
    await POST(login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }));
    const sessions = support.rowsOf("auth", "auth-sessions");
    const [entry] = Object.entries(sessions);
    const [rowKey, row] = entry!;
    const token = rowKey!.replace("auth/auth-sessions/", "");
    expect(Object.keys(sessions)).toHaveLength(1);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(row).toEqual({
      token,
      createdAt: NOW.toISOString(),
      expiresAt: TTL_12H.toISOString(),
    });
    expect(support.setCookieHeaders()[0]).toContain(`stories_studio_session=${token};`);
  });

  it("leaves the admin credential row untouched", async () => {
    const { support, POST } = await load();
    const before = support.rowsOf("auth", "auth");
    await POST(login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }));
    expect(support.rowsOf("auth", "auth")).toEqual(before);
    const credential = before["auth/auth/admin"] as {
      passwordHash: string;
      passwordSalt: string;
    };
    expect(
      await verifyPassword(
        support.ADMIN_PASSWORD,
        credential.passwordSalt,
        credential.passwordHash,
      ),
    ).toBe(true);
  });

  it("creates an independent session for every login (no single-session rule)", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 2; i += 1) {
      await POST(login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }));
    }
    expect(Object.keys(support.rowsOf("auth", "auth-sessions"))).toHaveLength(2);
  });
});

describe("POST /api/auth/login: wiring", () => {
  it("reads the auth namespace of the Supabase table with the configured URL and service key", async () => {
    const { support } = await load();
    expect(support.persistenceConstructions).toEqual([
      {
        url: "https://project.supabase.test",
        serviceRoleKey: "service-role-key",
        namespace: "auth",
      },
    ]);
  });
});

describe("POST /api/auth/login: rejections", () => {
  const bad = [
    ["missing password", { email: "admin@stories.test" }],
    ["missing email", { password: "x" }],
    ["malformed email", { email: "not-an-email", password: "x" }],
    ["empty password", { email: "admin@stories.test", password: "" }],
    ["non-string password", { email: "admin@stories.test", password: 12345678 }],
    ["empty object", {}],
    ["JSON null", null],
  ] as const;

  it.each(bad)("answers 400 for %s, before touching storage or cookies", async (_name, body) => {
    const { support, POST } = await load();
    const rowsBefore = support.rowsOf("auth");
    const response = await POST(login(support, body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Email and password are required." });
    expect(support.setCookieHeaders()).toEqual([]);
    expect(support.rowsOf("auth")).toEqual(rowsBefore);
  });

  it("answers 401 with the same body for a wrong password and for an unknown email", async () => {
    const { support, POST } = await load();
    const wrongPassword = await POST(
      login(support, { email: support.ADMIN_EMAIL, password: "nope" }),
    );
    const unknownEmail = await POST(
      login(support, { email: "someone@else.test", password: support.ADMIN_PASSWORD }),
    );
    for (const response of [wrongPassword, unknownEmail]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Incorrect email or password." });
    }
    expect(support.setCookieHeaders()).toEqual([]);
    expect(support.rowsOf("auth", "auth-sessions")).toEqual({});
  });

  it("compares the email case-sensitively", async () => {
    const { support, POST } = await load();
    const response = await POST(
      login(support, {
        email: support.ADMIN_EMAIL.toUpperCase(),
        password: support.ADMIN_PASSWORD,
      }),
    );
    expect(response.status).toBe(401);
  });

  it("answers 401 when no admin credential exists at all", async () => {
    const { support, POST } = await load();
    support.resetFakes();
    const response = await POST(login(support, { email: "a@b.test", password: "whatever" }));
    expect(response.status).toBe(401);
  });

  it("lets a malformed JSON body escape as an exception (Next turns it into a 500)", async () => {
    const { support, POST } = await load();
    await expect(POST(login(support, "{not json"))).rejects.toThrow(SyntaxError);
    expect(support.setCookieHeaders()).toEqual([]);
  });
});

describe("POST /api/auth/login: in-memory rate limit, keyed by client IP", () => {
  const ADMIN_IP = "198.51.100.7";
  const ATTACKER_IP = "203.0.113.66";
  const wrong = (support: typeof Support, ip: string | null = ATTACKER_IP, email?: string) =>
    login(support, { email: email ?? support.ADMIN_EMAIL, password: "wrong" }, ip);
  const right = (support: typeof Support, ip: string | null = ADMIN_IP) =>
    login(support, { email: support.ADMIN_EMAIL, password: support.ADMIN_PASSWORD }, ip);

  it("allows 10 failed attempts (401) from one IP and answers 429 from the 11th", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 10; i += 1) expect((await POST(wrong(support))).status).toBe(401);
    const limited = await POST(wrong(support));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: "Too many attempts. Try again in a few minutes.",
    });
  });

  it("(a) trips on 11 requests from one IP against DIFFERENT emails (credential stuffing)", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 10; i += 1) {
      expect((await POST(wrong(support, ATTACKER_IP, `victim${i}@stories.test`))).status).toBe(401);
    }
    expect((await POST(wrong(support, ATTACKER_IP, "victim11@stories.test"))).status).toBe(429);
  });

  it("(b) does NOT lock the admin out when 11+ requests against the admin email come from other IPs", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 11; i += 1) {
      const response = await POST(wrong(support, `203.0.113.${100 + i}`));
      expect(response.status).toBe(401);
    }
    for (let i = 0; i < 25; i += 1) await POST(wrong(support, `192.0.2.${i}`));
    const admin = await POST(right(support, ADMIN_IP));
    expect(admin.status).toBe(200);
    expect(await admin.json()).toEqual({ success: true });
  });

  it("(b2) the attacker IP is still throttled while the admin IP is not", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 11; i += 1) await POST(wrong(support, ATTACKER_IP));
    expect((await POST(wrong(support, ATTACKER_IP))).status).toBe(429);
    expect((await POST(right(support, ADMIN_IP))).status).toBe(200);
  });

  it("applies the limit before checking the password: the right password from a throttled IP is refused", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 11; i += 1) await POST(wrong(support, ADMIN_IP));
    const response = await POST(right(support, ADMIN_IP));
    expect(response.status).toBe(429);
    expect(support.setCookieHeaders()).toEqual([]);
    expect(support.rowsOf("auth", "auth-sessions")).toEqual({});
  });

  it("does not count malformed requests (400 returns before the limiter)", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 15; i += 1) {
      await POST(login(support, { email: "bad", password: "x" }, ADMIN_IP));
    }
    expect((await POST(right(support, ADMIN_IP))).status).toBe(200);
  });

  it("(c) a successful login clears that IP counter", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 9; i += 1) await POST(wrong(support, ADMIN_IP));
    expect((await POST(right(support, ADMIN_IP))).status).toBe(200);
    for (let i = 0; i < 10; i += 1) expect((await POST(wrong(support, ADMIN_IP))).status).toBe(401);
    expect((await POST(wrong(support, ADMIN_IP))).status).toBe(429);
  });

  it("a successful login from one IP does not clear another IP counter", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 11; i += 1) await POST(wrong(support, ATTACKER_IP));
    expect((await POST(right(support, ADMIN_IP))).status).toBe(200);
    expect((await POST(wrong(support, ATTACKER_IP))).status).toBe(429);
  });

  it("keeps the window open for exactly 15 minutes, then starts a new one", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 11; i += 1) await POST(wrong(support));
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60 * 1000));
    expect((await POST(wrong(support))).status).toBe(429);
    vi.setSystemTime(new Date(NOW.getTime() + 15 * 60 * 1000 + 1));
    expect((await POST(wrong(support))).status).toBe(401);
  });

  it("uses x-real-ip only; a client-supplied x-forwarded-for is ignored on Vercel", async () => {
    const { support, POST } = await load();
    for (let i = 0; i < 11; i += 1) {
      const request = wrong(support, ATTACKER_IP);
      request.headers.set("x-forwarded-for", `10.0.0.${i}`);
      await POST(request);
    }
    const spoofed = wrong(support, ATTACKER_IP);
    spoofed.headers.set("x-forwarded-for", "10.9.9.9");
    expect((await POST(spoofed)).status).toBe(429);
  });
});

describe("POST /api/auth/login: rate limit when no trustworthy client IP exists", () => {
  const wrong = (support: typeof Support, ip: string | null) =>
    login(support, { email: support.ADMIN_EMAIL, password: "wrong" }, ip);

  it("in development (no VERCEL) the limiter is skipped, even if a client sets x-real-ip", async () => {
    vi.stubEnv("VERCEL", "");
    const { support, POST } = await load();
    for (let i = 0; i < 15; i += 1) {
      expect((await POST(wrong(support, `203.0.113.${i % 2}`))).status).toBe(401);
    }
  });

  it("in production without VERCEL, a spoofed x-real-ip cannot dodge the limit: one shared bucket", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("NODE_ENV", "production");
    const { support, POST } = await load();
    for (let i = 0; i < 10; i += 1) {
      expect((await POST(wrong(support, `203.0.113.${i}`))).status).toBe(401);
    }
    expect((await POST(wrong(support, "203.0.113.200"))).status).toBe(429);
  });

  it("on Vercel with a missing or blank x-real-ip in production, falls back to the shared bucket, never to the email", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { support, POST } = await load();
    for (let i = 0; i < 5; i += 1) await POST(wrong(support, null));
    for (let i = 0; i < 5; i += 1) await POST(wrong(support, "   "));
    expect((await POST(wrong(support, null))).status).toBe(429);
    expect((await POST(wrong(support, "198.51.100.9"))).status).toBe(401);
  });
});
