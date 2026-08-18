import type { PersistencePort } from "../ports/types";

const TABLE = "persistence_records";

interface StoredRow {
  readonly value: unknown;
}

/**
 * `PersistencePort` over Supabase's PostgREST HTTP API — plain `fetch`, not
 * the `@supabase/supabase-js` SDK, matching this repo's established
 * preference (see runtime/adapters/resend-email-adapter.ts) for a direct
 * HTTP call over a full client library when a handful of REST endpoints is
 * all that's needed. Staying `fetch`-only also keeps this adapter usable
 * from `middleware.ts` on the standard Edge runtime — the SDK isn't.
 *
 * One generic table (`persistence_records`, see
 * supabase/migrations/0001_persistence_records.sql) backs every collection:
 * `namespace` plays the role `FileSystemPersistenceAdapter`'s constructor
 * `root` argument played (e.g. "auth", "knowledge"), `collection` and `id`
 * match `PersistencePort`'s own parameters exactly.
 */
export class SupabasePersistenceAdapter implements PersistencePort {
  private readonly restUrl: string;

  constructor(
    private readonly url: string,
    private readonly serviceRoleKey: string,
    private readonly namespace: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Deliberately no validation here, matching ResendEmailAdapter: this is
    // constructed at module scope in auth/server.ts and authoring/server.ts,
    // which every /studio/** page imports — including ones that should
    // still gracefully 404 via isStudioEnabled() when the Studio feature
    // itself is off. Throwing eagerly for an unconfigured Supabase project
    // would crash those pages too; failing lazily, only on an actual
    // request, keeps that gate working even before Supabase is set up.
    this.restUrl = `${url.replace(/\/$/, "")}/rest/v1/${TABLE}`;
  }

  async save<T>(collection: string, id: string, value: T): Promise<void> {
    await this.request("POST", this.restUrl, {
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: {
        namespace: this.namespace,
        collection,
        id,
        value,
        updated_at: new Date().toISOString(),
      },
    });
  }

  async load<T>(collection: string, id: string): Promise<T | undefined> {
    const rows = await this.request<StoredRow[]>(
      "GET",
      `${this.restUrl}?${this.matchParams(collection, id)}&select=value`,
    );
    return rows[0]?.value as T | undefined;
  }

  async list<T>(collection: string): Promise<readonly T[]> {
    const rows = await this.request<StoredRow[]>(
      "GET",
      `${this.restUrl}?namespace=eq.${encodeURIComponent(this.namespace)}&collection=eq.${encodeURIComponent(collection)}&select=value&order=id.asc`,
    );
    return rows.map((row) => row.value as T);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.request("DELETE", `${this.restUrl}?${this.matchParams(collection, id)}`);
  }

  private matchParams(collection: string, id: string): string {
    return `namespace=eq.${encodeURIComponent(this.namespace)}&collection=eq.${encodeURIComponent(collection)}&id=eq.${encodeURIComponent(id)}`;
  }

  private async request<T>(
    method: "GET" | "POST" | "DELETE",
    url: string,
    options: { headers?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "content-type": "application/json",
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Supabase request failed (${response.status} ${method} ${url}): ${detail}`);
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }
}
