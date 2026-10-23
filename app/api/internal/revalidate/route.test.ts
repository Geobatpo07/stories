import type * as CryptoModule from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The shared-secret revalidation endpoint called by the Python Studio API (ADR-004 phase 4,
// step 2b). Auth is a header compared in constant time, not a session.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof CryptoModule>();
  return { ...actual, timingSafeEqual: vi.fn(actual.timingSafeEqual) };
});

const SECRET = "s3cret-shared-with-python";

async function load() {
  vi.resetModules();
  const { POST } = await import("./route");
  const { revalidatePath } = await import("next/cache");
  const crypto = await import("node:crypto");
  (revalidatePath as ReturnType<typeof vi.fn>).mockClear();
  (crypto.timingSafeEqual as ReturnType<typeof vi.fn>).mockClear();
  return { POST, revalidatePath, timingSafeEqual: crypto.timingSafeEqual };
}

function call(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/internal/revalidate", { method: "POST", headers });
}

beforeEach(() => vi.stubEnv("REVALIDATE_SECRET", SECRET));
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/internal/revalidate", () => {
  it("revalidates the whole site layout with the right secret and answers 200", async () => {
    const { POST, revalidatePath } = await load();
    const response = await POST(call({ "x-revalidate-secret": SECRET }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: true });
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("answers 401 {error:'Unauthorized'} and revalidates nothing without the header", async () => {
    const { POST, revalidatePath } = await load();
    const response = await POST(call());
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong secret of the same length", "x".repeat(SECRET.length)],
    ["a shorter secret", "short"],
    ["a longer secret", `${SECRET}-and-more`],
    ["the secret with different case", SECRET.toUpperCase()],
    ["an empty secret", ""],
  ])("answers 401 for %s", async (_name, provided) => {
    const { POST, revalidatePath } = await load();
    expect((await POST(call({ "x-revalidate-secret": provided }))).status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not accept a Studio session cookie instead of the secret", async () => {
    const { POST, revalidatePath } = await load();
    const response = await POST(call({ cookie: "stories_studio_session=" + "a".repeat(64) }));
    expect(response.status).toBe(401);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("compares in constant time, on equal-length digests, even for secrets of different lengths", async () => {
    const { POST, timingSafeEqual } = await load();
    await POST(call({ "x-revalidate-secret": "short" }));
    await POST(call({ "x-revalidate-secret": SECRET }));
    expect(timingSafeEqual).toHaveBeenCalledTimes(2);
    for (const [left, right] of (timingSafeEqual as ReturnType<typeof vi.fn>).mock.calls as [
      Buffer,
      Buffer,
    ][]) {
      expect(left.length).toBe(32);
      expect(right.length).toBe(32);
    }
  });

  it.each([undefined, ""])(
    "fails closed with 503 when REVALIDATE_SECRET is %j, even for a matching empty header",
    async (value) => {
      vi.unstubAllEnvs();
      if (value !== undefined) vi.stubEnv("REVALIDATE_SECRET", value);
      else delete process.env.REVALIDATE_SECRET;
      const { POST, revalidatePath } = await load();
      for (const headers of [
        {},
        { "x-revalidate-secret": "" },
        { "x-revalidate-secret": "x" },
      ] as Record<string, string>[]) {
        const response = await POST(call(headers));
        expect(response.status).toBe(503);
        expect(await response.json()).toEqual({ error: "Revalidation is not configured." });
      }
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
