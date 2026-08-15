import type { PersistencePort } from "@/runtime";
import {
  adminCredentialSchema,
  resetTokenSchema,
  sessionSchema,
  type AdminCredential,
  type ResetToken,
  type Session,
} from "./types";

const ADMIN_COLLECTION = "auth";
const ADMIN_ID = "admin";
const SESSION_COLLECTION = "auth-sessions";
const RESET_TOKEN_COLLECTION = "auth-reset-tokens";

/** The single admin credential record. There is exactly one — id is fixed. */
export class CredentialRepository {
  constructor(private readonly persistence: PersistencePort) {}

  async get(): Promise<AdminCredential | undefined> {
    const value = await this.persistence.load<unknown>(ADMIN_COLLECTION, ADMIN_ID);
    return value === undefined ? undefined : adminCredentialSchema.parse(value);
  }

  async save(credential: AdminCredential): Promise<void> {
    await this.persistence.save(
      ADMIN_COLLECTION,
      ADMIN_ID,
      adminCredentialSchema.parse(credential),
    );
  }
}

export class SessionRepository {
  constructor(private readonly persistence: PersistencePort) {}

  async create(session: Session): Promise<void> {
    const validated = sessionSchema.parse(session);
    await this.persistence.save(SESSION_COLLECTION, validated.token, validated);
  }

  async get(token: string): Promise<Session | undefined> {
    const value = await this.persistence.load<unknown>(SESSION_COLLECTION, token);
    return value === undefined ? undefined : sessionSchema.parse(value);
  }

  async destroy(token: string): Promise<void> {
    await this.persistence.delete(SESSION_COLLECTION, token);
  }

  /** Signs out every active session — called after a password reset. */
  async destroyAll(): Promise<void> {
    const sessions = await this.persistence.list<Session>(SESSION_COLLECTION);
    await Promise.all(
      sessions.map((session) => this.persistence.delete(SESSION_COLLECTION, session.token)),
    );
  }
}

/** Single-use; a token is deleted the moment it is consumed, valid or not. */
export class ResetTokenRepository {
  constructor(private readonly persistence: PersistencePort) {}

  async create(token: string, resetToken: ResetToken): Promise<void> {
    await this.persistence.save(RESET_TOKEN_COLLECTION, token, resetTokenSchema.parse(resetToken));
  }

  async consume(token: string): Promise<ResetToken | undefined> {
    const value = await this.persistence.load<unknown>(RESET_TOKEN_COLLECTION, token);
    await this.persistence.delete(RESET_TOKEN_COLLECTION, token);
    return value === undefined ? undefined : resetTokenSchema.parse(value);
  }
}
