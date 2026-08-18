import { describe, expect, it, vi } from "vitest";
import { SupabasePersistenceAdapter } from "./supabase-persistence-adapter";

function fakeResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

/** Typed as `typeof fetch` explicitly — a bare `vi.fn(async () => ...)` infers a
 *  zero-parameter signature from its own callback, so `.mock.calls[0]` would type as `[]`. */
function mockFetch(response: Response) {
  return vi.fn<typeof fetch>(async () => response);
}

function firstCall(fetchImpl: ReturnType<typeof mockFetch>): [string, RequestInit] {
  const call = fetchImpl.mock.calls[0];
  if (!call) throw new Error("Expected fetch to have been called.");
  return [String(call[0]), call[1] ?? {}];
}

describe("SupabasePersistenceAdapter", () => {
  it("never throws at construction, even with an empty url/key — every /studio/** page constructs one at module scope, including ones that must still 404 cleanly when Supabase isn't configured yet", () => {
    expect(() => new SupabasePersistenceAdapter("", "", "auth")).not.toThrow();
  });

  it("save() upserts via POST with the merge-duplicates Prefer header", async () => {
    const fetchImpl = mockFetch(fakeResponse(undefined, { status: 204 }));
    const adapter = new SupabasePersistenceAdapter(
      "https://x.supabase.co",
      "service-role-key",
      "auth",
      fetchImpl,
    );

    await adapter.save("admin", "the-id", { email: "a@example.com" });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = firstCall(fetchImpl);
    expect(url).toBe("https://x.supabase.co/rest/v1/persistence_records");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "service-role-key",
      Authorization: "Bearer service-role-key",
      Prefer: "resolution=merge-duplicates,return=minimal",
    });
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      namespace: "auth",
      collection: "admin",
      id: "the-id",
      value: { email: "a@example.com" },
    });
    expect(typeof body.updated_at).toBe("string");
  });

  it("load() returns the stored value, or undefined when no row matches", async () => {
    const fetchImpl = mockFetch(fakeResponse([{ value: { email: "a@example.com" } }]));
    const adapter = new SupabasePersistenceAdapter(
      "https://x.supabase.co",
      "key",
      "auth",
      fetchImpl,
    );

    const value = await adapter.load("admin", "the-id");

    expect(value).toEqual({ email: "a@example.com" });
    const [url] = firstCall(fetchImpl);
    expect(url).toContain("namespace=eq.auth");
    expect(url).toContain("collection=eq.admin");
    expect(url).toContain("id=eq.the-id");
    expect(url).toContain("select=value");
  });

  it("load() returns undefined for an empty result set", async () => {
    const fetchImpl = mockFetch(fakeResponse([]));
    const adapter = new SupabasePersistenceAdapter(
      "https://x.supabase.co",
      "key",
      "auth",
      fetchImpl,
    );
    await expect(adapter.load("admin", "missing")).resolves.toBeUndefined();
  });

  it("list() maps every row's value, in the order returned", async () => {
    const fetchImpl = mockFetch(fakeResponse([{ value: { id: 1 } }, { value: { id: 2 } }]));
    const adapter = new SupabasePersistenceAdapter(
      "https://x.supabase.co",
      "key",
      "knowledge",
      fetchImpl,
    );

    const values = await adapter.list("program");

    expect(values).toEqual([{ id: 1 }, { id: 2 }]);
    const [url] = firstCall(fetchImpl);
    expect(url).toContain("namespace=eq.knowledge");
    expect(url).toContain("collection=eq.program");
    expect(url).toContain("order=id.asc");
  });

  it("delete() issues a DELETE scoped to namespace, collection, and id", async () => {
    const fetchImpl = mockFetch(fakeResponse(undefined, { status: 204 }));
    const adapter = new SupabasePersistenceAdapter(
      "https://x.supabase.co",
      "key",
      "auth",
      fetchImpl,
    );

    await adapter.delete("auth-sessions", "token-123");

    const [url, init] = firstCall(fetchImpl);
    expect(init.method).toBe("DELETE");
    expect(url).toContain("collection=eq.auth-sessions");
    expect(url).toContain("id=eq.token-123");
  });

  it("throws a descriptive error on a non-2xx response", async () => {
    const fetchImpl = mockFetch(
      fakeResponse("relation does not exist", { ok: false, status: 404 }),
    );
    const adapter = new SupabasePersistenceAdapter(
      "https://x.supabase.co",
      "key",
      "auth",
      fetchImpl,
    );

    await expect(adapter.load("admin", "the-id")).rejects.toThrow(/404/);
  });
});
