import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization of POST /api/auth/logout (ADR-004 Phase 4 step 1, backend/PHASE4-AUDIT.md).
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
const LATER = new Date("2026-08-16T00:00:00.000Z");
const COOKIE = "stories_studio_session";
const TOKEN = "a".repeat(64);
const OTHER = "b".repeat(64);

async function load() {
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const { POST } = await import("./route");
  await support.seedAdmin(NOW);
  support.seedSession(TOKEN, NOW, LATER);
  support.seedSession(OTHER, NOW, LATER);
  return { support, POST };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/logout", () => {
  it("answers 200 {success:true}, deletes only the caller's session row, keeps others", async () => {
    const { support, POST } = await load();
    support.jar.request.set(COOKIE, TOKEN);
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(Object.keys(support.rowsOf("auth", "auth-sessions"))).toEqual([
      `auth/auth-sessions/${OTHER}`,
    ]);
    expect(support.rowsOf("auth", "auth")["auth/auth/admin"]).toBeDefined();
  });

  it("clears the browser cookie with an empty value and an epoch expiry, dropping HttpOnly/SameSite", async () => {
    const { support, POST } = await load();
    support.jar.request.set(COOKIE, TOKEN);
    await POST();
    expect(support.setCookieHeaders()).toEqual([
      `${COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    ]);
  });

  it("without a cookie still answers 200, clears the cookie, and deletes nothing", async () => {
    const { support, POST } = await load();
    const before = support.rowsOf("auth");
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(support.setCookieHeaders()).toEqual([
      `${COOKIE}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    ]);
    expect(support.rowsOf("auth")).toEqual(before);
  });

  it("with an unknown token still answers 200 and leaves every real session in place", async () => {
    const { support, POST } = await load();
    support.jar.request.set(COOKIE, "c".repeat(64));
    const response = await POST();
    expect(response.status).toBe(200);
    expect(Object.keys(support.rowsOf("auth", "auth-sessions")).sort()).toEqual([
      `auth/auth-sessions/${TOKEN}`,
      `auth/auth-sessions/${OTHER}`,
    ]);
  });

  it("deletes an already-expired session row too (no expiry check on logout)", async () => {
    const { support, POST } = await load();
    vi.setSystemTime(new Date(LATER.getTime() + 1000));
    support.jar.request.set(COOKIE, TOKEN);
    expect((await POST()).status).toBe(200);
    expect(support.rowsOf("auth", "auth-sessions")[`auth/auth-sessions/${TOKEN}`]).toBeUndefined();
  });

  it("ignores a cookie with an empty value (nothing deleted, cookie still cleared)", async () => {
    const { support, POST } = await load();
    support.jar.request.set(COOKIE, "");
    expect((await POST()).status).toBe(200);
    expect(Object.keys(support.rowsOf("auth", "auth-sessions"))).toHaveLength(2);
  });
});
