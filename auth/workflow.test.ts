import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { EmailMessage, EmailPort } from "@/runtime";
import { FileSystemPersistenceAdapter, FixedClock } from "@/runtime";
import { afterEach, describe, expect, it } from "vitest";
import { hashPassword } from "./passwords";
import { CredentialRepository, ResetTokenRepository, SessionRepository } from "./repository";
import { AuthWorkflow } from "./workflow";

const NOW = new Date("2026-08-15T12:00:00.000Z");
const ADMIN_EMAIL = "lgeobatpo98@gmail.com";
const ADMIN_PASSWORD = "s3cret-passphrase";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function fakeEmail(): EmailPort & { messages: EmailMessage[] } {
  const messages: EmailMessage[] = [];
  return {
    messages,
    async send(message) {
      messages.push(message);
    },
  };
}

async function setup(now: Date = NOW) {
  const root = await mkdtemp(join(tmpdir(), "stories-auth-"));
  directories.push(root);
  const persistence = new FileSystemPersistenceAdapter(root);
  const credentials = new CredentialRepository(persistence);
  const sessions = new SessionRepository(persistence);
  const resetTokens = new ResetTokenRepository(persistence);
  const email = fakeEmail();
  const workflow = new AuthWorkflow(
    credentials,
    sessions,
    resetTokens,
    email,
    new FixedClock(now),
    "http://localhost:3000/studio/reset-password",
  );
  const { hash, salt } = await hashPassword(ADMIN_PASSWORD);
  await credentials.save({
    email: ADMIN_EMAIL,
    passwordHash: hash,
    passwordSalt: salt,
    updatedAt: now.toISOString(),
  });
  return { root, credentials, sessions, resetTokens, email, workflow };
}

async function loginToken(workflow: AuthWorkflow): Promise<string> {
  const result = await workflow.login(ADMIN_EMAIL, ADMIN_PASSWORD);
  if (!result.success || !result.sessionToken) throw new Error("Expected login to succeed.");
  return result.sessionToken;
}

function extractResetToken(message: EmailMessage): string {
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("Expected the email body to contain a reset link.");
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error("Expected the reset link to carry a token.");
  return token;
}

describe("AuthWorkflow.login", () => {
  it("succeeds with the correct email and password, and the session validates", async () => {
    const { workflow } = await setup();
    const token = await loginToken(workflow);
    await expect(workflow.validateSession(token)).resolves.toBe(true);
  });

  it("fails with the wrong password", async () => {
    const { workflow } = await setup();
    const result = await workflow.login(ADMIN_EMAIL, "wrong password");
    expect(result.success).toBe(false);
    expect(result.sessionToken).toBeUndefined();
  });

  it("fails for an unregistered email", async () => {
    const { workflow } = await setup();
    const result = await workflow.login("someone-else@example.com", ADMIN_PASSWORD);
    expect(result.success).toBe(false);
  });
});

describe("AuthWorkflow.logout / validateSession", () => {
  it("destroys the session so it no longer validates", async () => {
    const { workflow } = await setup();
    const token = await loginToken(workflow);
    await workflow.logout(token);
    await expect(workflow.validateSession(token)).resolves.toBe(false);
  });

  it("rejects and cleans up an expired session", async () => {
    const { workflow, sessions } = await setup();
    await sessions.create({
      token: "expired-token",
      createdAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(NOW.getTime() - 60 * 1000).toISOString(),
    });
    await expect(workflow.validateSession("expired-token")).resolves.toBe(false);
    await expect(sessions.get("expired-token")).resolves.toBeUndefined();
  });

  it("rejects an unknown session token", async () => {
    const { workflow } = await setup();
    await expect(workflow.validateSession("does-not-exist")).resolves.toBe(false);
  });
});

describe("AuthWorkflow.requestPasswordReset", () => {
  it("emails a reset link for the registered email", async () => {
    const { workflow, email } = await setup();
    await workflow.requestPasswordReset(ADMIN_EMAIL);
    expect(email.messages).toHaveLength(1);
    expect(email.messages[0]?.to).toBe(ADMIN_EMAIL);
    expect(email.messages[0]?.text).toContain("/studio/reset-password?token=");
  });

  it("sends nothing for an unregistered email, without revealing that", async () => {
    const { workflow, email } = await setup();
    await workflow.requestPasswordReset("someone-else@example.com");
    expect(email.messages).toHaveLength(0);
  });
});

describe("AuthWorkflow.confirmPasswordReset", () => {
  it("updates the password, signs out every session, and consumes the token", async () => {
    const { workflow, email } = await setup();
    const sessionToken = await loginToken(workflow);
    await workflow.requestPasswordReset(ADMIN_EMAIL);
    const firstMessage = email.messages[0];
    if (!firstMessage) throw new Error("Expected a reset email to have been sent.");
    const resetToken = extractResetToken(firstMessage);

    const confirmation = await workflow.confirmPasswordReset(resetToken, "new-passphrase-123");
    expect(confirmation.success).toBe(true);

    await expect(workflow.validateSession(sessionToken)).resolves.toBe(false);
    const oldLogin = await workflow.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(oldLogin.success).toBe(false);
    const newLogin = await workflow.login(ADMIN_EMAIL, "new-passphrase-123");
    expect(newLogin.success).toBe(true);

    const reuse = await workflow.confirmPasswordReset(resetToken, "another-one");
    expect(reuse.success).toBe(false);
  });

  it("rejects an expired token without changing the password", async () => {
    const { workflow, resetTokens } = await setup();
    await resetTokens.create("expired-token", {
      email: ADMIN_EMAIL,
      expiresAt: new Date(NOW.getTime() - 1000).toISOString(),
    });
    const confirmation = await workflow.confirmPasswordReset("expired-token", "new-passphrase-123");
    expect(confirmation.success).toBe(false);
    const stillWorks = await workflow.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    expect(stillWorks.success).toBe(true);
  });

  it("rejects an unknown token", async () => {
    const { workflow } = await setup();
    const confirmation = await workflow.confirmPasswordReset(
      "does-not-exist",
      "new-passphrase-123",
    );
    expect(confirmation.success).toBe(false);
  });
});
