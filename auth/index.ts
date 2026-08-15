/**
 * The Studio authentication module's sole public entry point. `server.ts`
 * (server-only singletons and cookie helpers) is imported directly by
 * `app/`, not re-exported here, matching `authoring/server.ts`'s convention
 * — see auth/README.md.
 */
export { CredentialRepository, ResetTokenRepository, SessionRepository } from "./repository";
export { generateToken, hashPassword, verifyPassword } from "./passwords";
export { AuthWorkflow } from "./workflow";
export type {
  AdminCredential,
  LoginResult,
  PasswordResetConfirmation,
  ResetToken,
  Session,
} from "./types";
