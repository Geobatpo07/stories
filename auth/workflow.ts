import type { ClockPort, EmailPort } from "@/runtime";
import { generateToken, hashPassword, verifyPassword } from "./passwords";
import type { CredentialRepository, ResetTokenRepository, SessionRepository } from "./repository";
import type { LoginResult, PasswordResetConfirmation } from "./types";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

/** Login, logout, session validation, and the password-reset lifecycle for the single Studio admin. */
export class AuthWorkflow {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly sessions: SessionRepository,
    private readonly resetTokens: ResetTokenRepository,
    private readonly email: EmailPort,
    private readonly clock: ClockPort,
    /** e.g. `${NEXT_PUBLIC_SITE_URL}/studio/reset-password` — the reset link's `?token=` is appended to this. */
    private readonly resetUrlBase: string,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const credential = await this.credentials.get();
    if (!credential || credential.email !== email) {
      // Hash a decoy so an unknown email takes roughly as long as a wrong password.
      await hashPassword(password);
      return { success: false };
    }
    const valid = await verifyPassword(password, credential.passwordSalt, credential.passwordHash);
    if (!valid) return { success: false };

    const token = generateToken();
    const createdAt = this.clock.now();
    const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_MS);
    await this.sessions.create({
      token,
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });
    return { success: true, sessionToken: token, expiresAt: expiresAt.toISOString() };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.destroy(token);
  }

  async validateSession(token: string): Promise<boolean> {
    const session = await this.sessions.get(token);
    if (!session) return false;
    if (new Date(session.expiresAt).getTime() <= this.clock.now().getTime()) {
      await this.sessions.destroy(token);
      return false;
    }
    return true;
  }

  /** Resolves identically whether or not `email` is registered — never reveals account existence. */
  async requestPasswordReset(email: string): Promise<void> {
    const credential = await this.credentials.get();
    if (!credential || credential.email !== email) return;

    const token = generateToken();
    const expiresAt = new Date(this.clock.now().getTime() + RESET_TOKEN_TTL_MS);
    await this.resetTokens.create(token, {
      email: credential.email,
      expiresAt: expiresAt.toISOString(),
    });

    const link = `${this.resetUrlBase}?token=${token}`;
    await this.email.send({
      to: credential.email,
      subject: "Reset your Stories Studio password",
      text: `Open this link to choose a new password (expires in 1 hour): ${link}`,
      html: `<p>Open this link to choose a new password (expires in 1 hour):</p><p><a href="${link}">${link}</a></p>`,
    });
  }

  async confirmPasswordReset(
    token: string,
    newPassword: string,
  ): Promise<PasswordResetConfirmation> {
    const resetToken = await this.resetTokens.consume(token);
    if (!resetToken) {
      return { success: false, error: "This reset link is invalid or has already been used." };
    }
    if (new Date(resetToken.expiresAt).getTime() <= this.clock.now().getTime()) {
      return { success: false, error: "This reset link has expired." };
    }
    const credential = await this.credentials.get();
    if (!credential || credential.email !== resetToken.email) {
      return { success: false, error: "This reset link is invalid or has already been used." };
    }

    const { hash, salt } = await hashPassword(newPassword);
    await this.credentials.save({
      email: credential.email,
      passwordHash: hash,
      passwordSalt: salt,
      updatedAt: this.clock.now().toISOString(),
    });
    await this.sessions.destroyAll();
    return { success: true };
  }
}
