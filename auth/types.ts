import { z } from "zod";

/**
 * Shared with `middleware.ts`, which imports it directly (not through
 * `auth/server.ts`, to avoid pulling `@/runtime`'s barrel — and with it
 * `@duckdb/node-api` — into the Middleware bundle; see middleware.ts).
 */
export const SESSION_COOKIE_NAME = "stories_studio_session";

/**
 * Single-admin credential record — this Studio has one operator, not a
 * multi-user system (matches ADR-001's "single-author research notebook").
 */
export const adminCredentialSchema = z.object({
  email: z.string().email(),
  passwordHash: z.string().min(1),
  passwordSalt: z.string().min(1),
  updatedAt: z.string().datetime(),
});
export type AdminCredential = z.infer<typeof adminCredentialSchema>;

export const sessionSchema = z.object({
  /** Redundant with the record's own persistence id — kept on the value too so
   *  SessionRepository.destroyAll() can delete by token after a listing scan,
   *  since PersistencePort.list() returns values only, never ids. */
  token: z.string().min(1),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});
export type Session = z.infer<typeof sessionSchema>;

export const resetTokenSchema = z.object({
  email: z.string().email(),
  expiresAt: z.string().datetime(),
});
export type ResetToken = z.infer<typeof resetTokenSchema>;

export interface LoginResult {
  readonly success: boolean;
  readonly sessionToken?: string;
  readonly expiresAt?: string;
}

export interface PasswordResetConfirmation {
  readonly success: boolean;
  readonly error?: string;
}
