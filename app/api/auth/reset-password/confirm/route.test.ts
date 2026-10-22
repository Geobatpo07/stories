import type * as Support from "@/app/api/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "@/auth/passwords";

// Characterization of POST /api/auth/reset-password/confirm (ADR-004 Phase 4 step 1,
// backend/PHASE4-AUDIT.md).
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
const TOKEN = "e".repeat(64);
const NEW_PASSWORD = "brand new passphrase";
const INVALID = "This reset link is invalid or has already been used.";

async function load() {
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const { POST } = await import("./route");
  await support.seedAdmin(NOW);
  return { support, POST };
}

function seedToken(support: typeof Support, expiresAt: Date, email: string = support.ADMIN_EMAIL) {
  support.putRow("auth", "auth-reset-tokens", TOKEN, { email, expiresAt: expiresAt.toISOString() });
}

const confirm = (support: typeof Support, body: unknown) =>
  support.jsonRequest("http://localhost/api/auth/reset-password/confirm", body);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/reset-password/confirm: input validation", () => {
  it.each([
    ["missing token", { password: "long enough" }],
    ["empty token", { token: "", password: "long enough" }],
    ["missing password", { token: TOKEN }],
    ["7-character password", { token: TOKEN, password: "1234567" }],
    ["non-string token", { token: 1, password: "long enough" }],
  ])("answers 400 for %s and consumes nothing", async (_name, body) => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    const rows = support.rowsOf("auth");
    const response = await POST(confirm(support, body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "A reset token and a password of at least 8 characters are required.",
    });
    expect(support.rowsOf("auth")).toEqual(rows);
  });

  it("accepts an 8-character password (the minimum counts characters, not bytes)", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    const response = await POST(confirm(support, { token: TOKEN, password: "12345678" }));
    expect(response.status).toBe(200);
  });

  it("lets a malformed JSON body escape as an exception (Next turns it into a 500)", async () => {
    const { support, POST } = await load();
    await expect(POST(confirm(support, "{oops"))).rejects.toThrow(SyntaxError);
  });
});

describe("POST /api/auth/reset-password/confirm: success", () => {
  it("answers 200 {success:true}, replaces the credential, and consumes the token", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    const before = support.rowsOf("auth", "auth")["auth/auth/admin"] as {
      passwordHash: string;
      passwordSalt: string;
    };
    const response = await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const after = support.rowsOf("auth", "auth")["auth/auth/admin"] as {
      email: string;
      passwordHash: string;
      passwordSalt: string;
      updatedAt: string;
    };
    expect(Object.keys(after).sort()).toEqual([
      "email",
      "passwordHash",
      "passwordSalt",
      "updatedAt",
    ]);
    expect(after.email).toBe(support.ADMIN_EMAIL);
    expect(after.updatedAt).toBe(NOW.toISOString());
    expect(after.passwordSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(after.passwordHash).toMatch(/^[0-9a-f]{128}$/);
    expect(after.passwordSalt).not.toBe(before.passwordSalt);
    expect(await verifyPassword(NEW_PASSWORD, after.passwordSalt, after.passwordHash)).toBe(true);
    expect(
      await verifyPassword(support.ADMIN_PASSWORD, after.passwordSalt, after.passwordHash),
    ).toBe(false);
    expect(support.rowsOf("auth", "auth-reset-tokens")).toEqual({});
  });

  it("signs out every session, including ones other than the requester's", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    support.seedSession("1".repeat(64), NOW, new Date(NOW.getTime() + 3_600_000));
    support.seedSession("2".repeat(64), NOW, new Date(NOW.getTime() + 3_600_000));
    await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(support.rowsOf("auth", "auth-sessions")).toEqual({});
  });

  it("does not set or clear any cookie", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(support.setCookieHeaders()).toEqual([]);
  });

  it("is single-use: replaying the same token answers 400 and keeps the new password", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    const replay = await POST(confirm(support, { token: TOKEN, password: "another passphrase" }));
    expect(replay.status).toBe(400);
    expect(await replay.json()).toEqual({ error: INVALID });
    const credential = support.rowsOf("auth", "auth")["auth/auth/admin"] as {
      passwordHash: string;
      passwordSalt: string;
    };
    expect(
      await verifyPassword(NEW_PASSWORD, credential.passwordSalt, credential.passwordHash),
    ).toBe(true);
  });
});

describe("POST /api/auth/reset-password/confirm: failures", () => {
  it("answers 400 with the generic message for an unknown token, changing nothing", async () => {
    const { support, POST } = await load();
    support.seedSession("3".repeat(64), NOW, new Date(NOW.getTime() + 1000));
    const rows = support.rowsOf("auth");
    const response = await POST(confirm(support, { token: "nope", password: NEW_PASSWORD }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: INVALID });
    expect(support.rowsOf("auth")).toEqual(rows);
  });

  it("answers 400 'expired' for an expired token, burns it, and keeps the old password and sessions", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() - 1));
    support.seedSession("4".repeat(64), NOW, new Date(NOW.getTime() + 1000));
    const credentialBefore = support.rowsOf("auth", "auth")["auth/auth/admin"];
    const response = await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This reset link has expired." });
    expect(support.rowsOf("auth", "auth-reset-tokens")).toEqual({});
    expect(support.rowsOf("auth", "auth")["auth/auth/admin"]).toEqual(credentialBefore);
    expect(Object.keys(support.rowsOf("auth", "auth-sessions"))).toHaveLength(1);
  });

  it("treats a token expiring exactly now as expired (strict comparison)", async () => {
    const { support, POST } = await load();
    seedToken(support, NOW);
    const response = await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "This reset link has expired." });
  });

  it("accepts a token expiring one millisecond from now", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 1));
    expect((await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }))).status).toBe(
      200,
    );
  });

  it("answers the generic 400 and still burns the token when it was issued for another email", async () => {
    const { support, POST } = await load();
    seedToken(support, new Date(NOW.getTime() + 60_000), "someone@else.test");
    const credentialBefore = support.rowsOf("auth", "auth")["auth/auth/admin"];
    const response = await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: INVALID });
    expect(support.rowsOf("auth", "auth-reset-tokens")).toEqual({});
    expect(support.rowsOf("auth", "auth")["auth/auth/admin"]).toEqual(credentialBefore);
  });

  it("answers the generic 400 when the admin credential no longer exists", async () => {
    const { support, POST } = await load();
    support.resetFakes();
    seedToken(support, new Date(NOW.getTime() + 60_000));
    const response = await POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: INVALID });
    expect(support.rowsOf("auth", "auth")).toEqual({});
  });

  it("lets a corrupt stored token row escape as an exception, after deleting it", async () => {
    const { support, POST } = await load();
    support.putRow("auth", "auth-reset-tokens", TOKEN, {
      email: "not-an-email",
      expiresAt: "soon",
    });
    await expect(
      POST(confirm(support, { token: TOKEN, password: NEW_PASSWORD })),
    ).rejects.toThrow();
    expect(support.rowsOf("auth", "auth-reset-tokens")).toEqual({});
  });
});
