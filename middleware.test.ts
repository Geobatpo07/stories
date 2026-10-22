import { NextRequest } from "next/server";
import type * as Support from "@/app/api/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization of middleware.ts (ADR-004 Phase 4 step 1, backend/PHASE4-AUDIT.md). The real
// middleware and the real SessionRepository run against an in-memory `persistence_records`.
vi.mock(
  "@/runtime/adapters/supabase-persistence-adapter",
  async () => (await import("@/app/api/test-support")).supabaseAdapterMock,
);

const NOW = new Date("2026-08-15T12:00:00.000Z");
const TOKEN = "7".repeat(64);
const COOKIE = "stories_studio_session";

async function load() {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const module_ = await import("./middleware");
  return { support, ...module_ };
}

function request(path: string, token?: string, method = "GET") {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: token === undefined ? {} : { cookie: `${COOKIE}=${token}` },
  });
}

function seed(support: typeof Support, expiresAt: Date) {
  support.seedSession(TOKEN, new Date(NOW.getTime() - 1000), expiresAt);
}

const FUTURE = new Date(NOW.getTime() + 60_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

function passedThrough(response: Response) {
  return response.status === 200 && response.headers.get("x-middleware-next") === "1";
}

describe("middleware: configuration and wiring", () => {
  it("matches exactly /studio/** and /api/studio/**", async () => {
    const { config } = await load();
    expect(config).toEqual({ matcher: ["/studio/:path*", "/api/studio/:path*"] });
  });

  it("reads sessions from the 'auth' namespace with the Supabase env values", async () => {
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

describe("middleware: public studio paths", () => {
  it.each([
    "/studio/login",
    "/studio/login/",
    "/studio/login/anything/below",
    "/studio/reset-password",
    "/studio/reset-password/x",
  ])("lets %s through without any session", async (path) => {
    const { middleware } = await load();
    expect(passedThrough(await middleware(request(path)))).toBe(true);
  });

  it("does not look the cookie up for a public path (an unknown token is irrelevant)", async () => {
    const { middleware } = await load();
    expect(passedThrough(await middleware(request("/studio/login", "garbage")))).toBe(true);
  });

  it.each(["/studio/login-help", "/studio/loginx", "/studio/reset-passwords", "/studio/Login"])(
    "treats %s as protected (prefix match needs a '/' boundary, case-sensitive)",
    async (path) => {
      const { middleware } = await load();
      const response = await middleware(request(path));
      expect(response.status).toBe(307);
    },
  );

  it("does not exempt the API twins of the public pages", async () => {
    const { middleware } = await load();
    const response = await middleware(request("/api/studio/login"));
    expect(response.status).toBe(401);
  });
});

describe("middleware: unauthenticated branching", () => {
  it.each(["/studio", "/studio/", "/studio/documents/abc", "/studio/new/note"])(
    "redirects page %s to /studio/login with a 307 and an absolute URL",
    async (path) => {
      const { middleware } = await load();
      const response = await middleware(request(path));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe("http://localhost:3000/studio/login");
      expect(response.headers.get("x-middleware-next")).toBeNull();
    },
  );

  it.each(["/api/studio/documents", "/api/studio/documents/abc/publish", "/api/studio"])(
    "answers 401 JSON {error:'Unauthorized'} for %s instead of redirecting",
    async (path) => {
      const { middleware } = await load();
      const response = await middleware(request(path, undefined, "POST"));
      expect(response.status).toBe(401);
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    },
  );

  it("does not preserve the originally requested page or query in the login redirect", async () => {
    const { middleware } = await load();
    const response = await middleware(request("/studio/documents/abc?tab=2"));
    expect(response.headers.get("location")).toBe("http://localhost:3000/studio/login");
  });

  it("treats an empty cookie value like no cookie", async () => {
    const { middleware } = await load();
    expect((await middleware(request("/studio", ""))).status).toBe(307);
  });

  it("treats an unknown token as unauthenticated", async () => {
    const { middleware } = await load();
    expect((await middleware(request("/studio", "nope"))).status).toBe(307);
  });
});

describe("middleware: session expiry comparison (expiresAt > now, strict)", () => {
  it("lets a valid session through to a page and to an API route", async () => {
    const { middleware, support } = await load();
    seed(support, FUTURE);
    expect(passedThrough(await middleware(request("/studio", TOKEN)))).toBe(true);
    expect(passedThrough(await middleware(request("/api/studio/documents", TOKEN)))).toBe(true);
  });

  it("accepts a session expiring one millisecond from now", async () => {
    const { middleware, support } = await load();
    seed(support, new Date(NOW.getTime() + 1));
    expect(passedThrough(await middleware(request("/studio", TOKEN)))).toBe(true);
  });

  it("rejects a session expiring exactly now", async () => {
    const { middleware, support } = await load();
    seed(support, NOW);
    expect((await middleware(request("/studio", TOKEN))).status).toBe(307);
    expect((await middleware(request("/api/studio/documents", TOKEN))).status).toBe(401);
  });

  it("rejects an expired session, and leaves its row in place (the middleware never deletes)", async () => {
    const { middleware, support } = await load();
    seed(support, new Date(NOW.getTime() - 1000));
    expect((await middleware(request("/studio", TOKEN))).status).toBe(307);
    expect(Object.keys(support.rowsOf("auth", "auth-sessions"))).toEqual([
      `auth/auth-sessions/${TOKEN}`,
    ]);
  });

  it("does not require the session row's token field to match the cookie (lookup is by row id only)", async () => {
    const { middleware, support } = await load();
    support.putRow("auth", "auth-sessions", TOKEN, {
      token: "another-token",
      createdAt: NOW.toISOString(),
      expiresAt: FUTURE.toISOString(),
    });
    expect(passedThrough(await middleware(request("/studio", TOKEN)))).toBe(true);
  });

  it("honours the clock at call time, not at import time", async () => {
    const { middleware, support } = await load();
    seed(support, FUTURE);
    expect(passedThrough(await middleware(request("/studio", TOKEN)))).toBe(true);
    vi.setSystemTime(new Date(FUTURE.getTime() + 1));
    expect((await middleware(request("/studio", TOKEN))).status).toBe(307);
  });
});

describe("middleware: malformed session rows (schema failures are not caught)", () => {
  it.each([
    [
      "expiresAt that is not an ISO datetime",
      { token: TOKEN, createdAt: NOW.toISOString(), expiresAt: "tomorrow" },
    ],
    ["missing expiresAt", { token: TOKEN, createdAt: NOW.toISOString() }],
    [
      "empty token field",
      { token: "", createdAt: NOW.toISOString(), expiresAt: FUTURE.toISOString() },
    ],
    ["a non-object value", "session"],
  ])(
    "throws for a row with %s (Next answers 500), instead of denying with 401/307",
    async (_n, value) => {
      const { middleware, support } = await load();
      support.putRow("auth", "auth-sessions", TOKEN, value);
      await expect(middleware(request("/studio", TOKEN))).rejects.toThrow();
      await expect(middleware(request("/api/studio/documents", TOKEN))).rejects.toThrow();
    },
  );

  it("does not parse the row for a public path, so a corrupt row cannot block the login page", async () => {
    const { middleware, support } = await load();
    support.putRow("auth", "auth-sessions", TOKEN, "corrupt");
    expect(passedThrough(await middleware(request("/studio/login", TOKEN)))).toBe(true);
  });
});
