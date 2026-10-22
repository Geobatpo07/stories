import { NextResponse } from "next/server";
import { hashPassword } from "@/auth/passwords";
import type { EmailMessage } from "@/runtime";

/**
 * Test support for the route/middleware characterization tests (ADR-004 Phase 4, step 1; see
 * backend/PHASE4-AUDIT.md). Not a test file. Each test file mocks three module boundaries with
 * these fakes and leaves everything else (route handlers, `auth/server.ts`, `authoring/server.ts`,
 * the workflows, repositories, `middleware.ts`) real:
 *
 *   - `@/runtime/adapters/supabase-persistence-adapter` -> an in-memory `persistence_records`;
 *   - `@/runtime/adapters/resend-email-adapter`         -> a recording email sender;
 *   - `next/headers`                                    -> a cookie jar whose writes go through
 *                                                          Next's real `ResponseCookies`, so the
 *                                                          serialized Set-Cookie header is real.
 */

export const ADMIN_EMAIL = "admin@stories.test";
export const ADMIN_PASSWORD = "correct horse battery";

/**
 * All mutable state lives on `globalThis`: tests call `vi.resetModules()` (the login route keeps a
 * module-level attempt counter) but Vitest caches mock-factory results, so two evaluations of this
 * module must still see the same rows, emails and cookie jar.
 */
interface SharedState {
  records: Map<string, unknown>;
  persistenceConstructions: Construction[];
  emailConstructions: { apiKey: string; from: string }[];
  sentEmails: EmailMessage[];
  emailFailure: Error | undefined;
  jar: { request: Map<string, string>; response: NextResponse };
}
const initial: SharedState = {
  records: new Map(),
  persistenceConstructions: [],
  emailConstructions: [],
  sentEmails: [],
  emailFailure: undefined,
  jar: { request: new Map(), response: NextResponse.next() },
};
const shared = ((globalThis as { __storiesRouteFakes?: SharedState }).__storiesRouteFakes ??=
  initial);

/** One row of the `persistence_records` table, keyed like its primary key. */
const records = shared.records;
const key = (namespace: string, collection: string, id: string) =>
  JSON.stringify([namespace, collection, id]);

export interface Construction {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly namespace: string;
}
export const persistenceConstructions = shared.persistenceConstructions;
export const emailConstructions = shared.emailConstructions;
export const sentEmails = shared.sentEmails;

/** Mimics the PostgREST adapter: JSON round trip, `list` ordered by id ascending, miss -> undefined. */
class InMemorySupabasePersistence {
  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly namespace: string,
  ) {
    persistenceConstructions.push({ url, serviceRoleKey, namespace });
  }
  async save<T>(collection: string, id: string, value: T): Promise<void> {
    records.set(key(this.namespace, collection, id), JSON.parse(JSON.stringify(value)));
  }
  async load<T>(collection: string, id: string): Promise<T | undefined> {
    const value = records.get(key(this.namespace, collection, id));
    return value === undefined ? undefined : (JSON.parse(JSON.stringify(value)) as T);
  }
  async list<T>(collection: string): Promise<readonly T[]> {
    return [...records.entries()]
      .map(([k, value]) => ({ parts: JSON.parse(k) as string[], value }))
      .filter((row) => row.parts[0] === this.namespace && row.parts[1] === collection)
      .sort((a, b) => (a.parts[2]! < b.parts[2]! ? -1 : a.parts[2]! > b.parts[2]! ? 1 : 0))
      .map((row) => JSON.parse(JSON.stringify(row.value)) as T);
  }
  async delete(collection: string, id: string): Promise<void> {
    records.delete(key(this.namespace, collection, id));
  }
}

class RecordingEmailAdapter {
  constructor(apiKey: string, from: string) {
    emailConstructions.push({ apiKey, from });
  }
  async send(message: EmailMessage): Promise<void> {
    if (shared.emailFailure) throw shared.emailFailure;
    sentEmails.push(message);
  }
}

export const supabaseAdapterMock = { SupabasePersistenceAdapter: InMemorySupabasePersistence };
export const resendAdapterMock = { ResendEmailAdapter: RecordingEmailAdapter };

export function failNextEmails(error: Error | undefined): void {
  shared.emailFailure = error;
}

/** Every stored row as `namespace/collection/id` -> value, for exact persistence assertions. */
export function rowsOf(namespace: string, collection?: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, value] of records) {
    const [ns, col, id] = JSON.parse(k) as string[];
    if (ns === namespace && (collection === undefined || col === collection)) {
      out[`${ns}/${col}/${id}`] = value;
    }
  }
  return out;
}

export function putRow(namespace: string, collection: string, id: string, value: unknown): void {
  records.set(key(namespace, collection, id), value);
}

export async function seedAdmin(now: Date): Promise<void> {
  const { hash, salt } = await hashPassword(ADMIN_PASSWORD);
  putRow("auth", "auth", "admin", {
    email: ADMIN_EMAIL,
    passwordHash: hash,
    passwordSalt: salt,
    updatedAt: now.toISOString(),
  });
}

export function seedSession(token: string, createdAt: Date, expiresAt: Date): void {
  putRow("auth", "auth-sessions", token, {
    token,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });
}

export const jar = shared.jar;

export const nextHeadersMock = {
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.request.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      jar.response.cookies.set(name, value, options);
    },
    delete: (name: string) => {
      jar.response.cookies.delete(name);
    },
  }),
};

/** The serialized `Set-Cookie` headers the route handler produced. */
export function setCookieHeaders(): string[] {
  return jar.response.headers.getSetCookie();
}

export function resetFakes(): void {
  records.clear();
  persistenceConstructions.length = 0;
  emailConstructions.length = 0;
  sentEmails.length = 0;
  shared.emailFailure = undefined;
  jar.request.clear();
  jar.response = NextResponse.next();
}

export function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
