import type * as Support from "@/app/api/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization of POST /api/auth/reset-password (ADR-004 Phase 4 step 1,
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
const IN_ONE_HOUR = "2026-08-15T13:00:00.000Z";

async function load(env: Record<string, string> = {}) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const { POST } = await import("./route");
  await support.seedAdmin(NOW);
  return { support, POST };
}

const request = (support: typeof Support, body: unknown) =>
  support.jsonRequest("http://localhost/api/auth/reset-password", body);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/reset-password", () => {
  it.each([
    ["missing email", {}],
    ["malformed email", { email: "nope" }],
    ["non-string email", { email: 5 }],
  ])("answers 400 for %s without storing or sending anything", async (_name, body) => {
    const { support, POST } = await load();
    const rows = support.rowsOf("auth");
    const response = await POST(request(support, body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "A valid email is required." });
    expect(support.rowsOf("auth")).toEqual(rows);
    expect(support.sentEmails).toEqual([]);
  });

  it("for the admin email: answers 200 {success:true}, stores a 1 h single-use token, sends one email", async () => {
    const { support, POST } = await load({
      NEXT_PUBLIC_SITE_URL: "https://stories.test/",
      RESEND_API_KEY: "re_key",
      STUDIO_ADMIN_RESET_FROM_EMAIL: "studio@stories.test",
    });
    const response = await POST(request(support, { email: support.ADMIN_EMAIL }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });

    const tokens = support.rowsOf("auth", "auth-reset-tokens");
    const [entry] = Object.entries(tokens);
    const [rowKey, row] = entry!;
    const token = rowKey!.replace("auth/auth-reset-tokens/", "");
    expect(Object.keys(tokens)).toHaveLength(1);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(row).toEqual({ email: support.ADMIN_EMAIL, expiresAt: IN_ONE_HOUR });

    const link = `https://stories.test/studio/reset-password?token=${token}`;
    expect(support.sentEmails).toEqual([
      {
        to: support.ADMIN_EMAIL,
        subject: "Reset your Stories Studio password",
        text: `Open this link to choose a new password (expires in 1 hour): ${link}`,
        html: `<p>Open this link to choose a new password (expires in 1 hour):</p><p><a href="${link}">${link}</a></p>`,
      },
    ]);
    expect(support.emailConstructions).toEqual([{ apiKey: "re_key", from: "studio@stories.test" }]);
  });

  it("defaults the link base to http://localhost:3000 and the sender to onboarding@resend.dev", async () => {
    // CI exports placeholder values for these; the test is about their absence.
    for (const name of ["NEXT_PUBLIC_SITE_URL", "RESEND_API_KEY", "STUDIO_ADMIN_RESET_FROM_EMAIL"])
      vi.stubEnv(name, undefined);
    const { support, POST } = await load();
    await POST(request(support, { email: support.ADMIN_EMAIL }));
    expect(support.sentEmails[0]?.text).toContain(
      "http://localhost:3000/studio/reset-password?token=",
    );
    expect(support.emailConstructions).toEqual([{ apiKey: "", from: "onboarding@resend.dev" }]);
  });

  it("answers an unknown email with the same 200 {success:true}, storing no token and sending no email", async () => {
    const { support, POST } = await load();
    const response = await POST(request(support, { email: "stranger@stories.test" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(support.rowsOf("auth", "auth-reset-tokens")).toEqual({});
    expect(support.sentEmails).toEqual([]);
  });

  it("matches the email case-sensitively (an upper-cased admin email is treated as unknown)", async () => {
    const { support, POST } = await load();
    const response = await POST(request(support, { email: support.ADMIN_EMAIL.toUpperCase() }));
    expect(response.status).toBe(200);
    expect(support.sentEmails).toEqual([]);
  });

  it("answers 200 when no admin credential exists", async () => {
    const { support, POST } = await load();
    support.resetFakes();
    const response = await POST(request(support, { email: support.ADMIN_EMAIL }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(support.sentEmails).toEqual([]);
  });

  it("does not invalidate earlier tokens: every request adds another valid one", async () => {
    const { support, POST } = await load();
    await POST(request(support, { email: support.ADMIN_EMAIL }));
    await POST(request(support, { email: support.ADMIN_EMAIL }));
    expect(Object.keys(support.rowsOf("auth", "auth-reset-tokens"))).toHaveLength(2);
    expect(support.sentEmails).toHaveLength(2);
  });

  it("does not touch existing sessions or the credential", async () => {
    const { support, POST } = await load();
    support.seedSession("d".repeat(64), NOW, new Date(NOW.getTime() + 1000));
    const before = {
      ...support.rowsOf("auth", "auth"),
      ...support.rowsOf("auth", "auth-sessions"),
    };
    await POST(request(support, { email: support.ADMIN_EMAIL }));
    expect({
      ...support.rowsOf("auth", "auth"),
      ...support.rowsOf("auth", "auth-sessions"),
    }).toEqual(before);
  });

  it("when the email provider fails: the error escapes (500) and the token row is already stored", async () => {
    const { support, POST } = await load();
    support.failNextEmails(new Error("Resend rejected the email (403): domain not verified"));
    await expect(POST(request(support, { email: support.ADMIN_EMAIL }))).rejects.toThrow(
      "Resend rejected the email (403): domain not verified",
    );
    expect(Object.keys(support.rowsOf("auth", "auth-reset-tokens"))).toHaveLength(1);
  });

  it("lets a malformed JSON body escape as an exception (Next turns it into a 500)", async () => {
    const { support, POST } = await load();
    await expect(POST(request(support, "{oops"))).rejects.toThrow(SyntaxError);
  });
});
