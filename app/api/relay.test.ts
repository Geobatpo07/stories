// The six write routes after the repoint are pure relays: each forwards to its Python endpoint
// and returns the Python status, body and Set-Cookie untouched. Only next/headers and fetch are faked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "stories_studio_session" && cookieJar.value !== undefined
        ? { name, value: cookieJar.value }
        : undefined,
  }),
}));

import { POST as login } from "./auth/login/route";
import { POST as logout } from "./auth/logout/route";
import { POST as reset } from "./auth/reset-password/route";
import { POST as confirm } from "./auth/reset-password/confirm/route";
import { POST as saveDraft } from "./studio/documents/route";
import { POST as publish } from "./studio/documents/[id]/publish/route";

const BASE = "http://127.0.0.1:8000";
const TOKEN = "a".repeat(64);
const ID = "11111111-1111-4111-8111-111111111111";
const ctx = { params: Promise.resolve({ id: ID }) };

const routes = [
  { name: "login", call: (r: Request) => login(r), path: "/api/auth/login" },
  { name: "logout", call: (r: Request) => logout(r), path: "/api/auth/logout" },
  { name: "reset", call: (r: Request) => reset(r), path: "/api/auth/reset-password" },
  { name: "confirm", call: (r: Request) => confirm(r), path: "/api/auth/reset-password/confirm" },
  { name: "saveDraft", call: (r: Request) => saveDraft(r), path: "/api/studio/documents" },
  {
    name: "publish",
    call: (r: Request) => publish(r, ctx),
    path: `/api/studio/documents/${ID}/publish`,
  },
];

const request = (body = '{"a":1}') =>
  new Request("http://localhost/x", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-real-ip": "203.0.113.9", cookie: "other=1" },
  });

let calls: [RequestInfo | URL, RequestInit | undefined][];
function upstream(make: () => Response) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input, init) => {
      calls.push([input, init]);
      return make();
    }),
  );
}

beforeEach(() => {
  cookieJar.value = TOKEN;
  vi.stubEnv("PYTHON_API_BASE_URL", BASE);
  upstream(() => Response.json({ ok: true }));
});

describe.each(routes)("$name relays to Python", ({ call, path }) => {
  it("POSTs the raw body to the matching endpoint with only the session cookie", async () => {
    await call(request());
    expect(calls).toHaveLength(1);
    expect(String(calls[0]![0])).toBe(`${BASE}${path}`);
    const init = calls[0]![1]!;
    const headers = new Headers(init.headers);
    expect(init.method).toBe("POST");
    expect(init.body).toBe('{"a":1}');
    expect(headers.get("cookie")).toBe(`stories_studio_session=${TOKEN}`);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("x-real-ip")).toBe("203.0.113.9");
  });

  it("sends no cookie header without a session", async () => {
    cookieJar.value = undefined;
    await call(request());
    expect(new Headers(calls[0]![1]!.headers).has("cookie")).toBe(false);
  });

  it.each([200, 400, 401, 404, 422, 429, 500])("returns Python's %i and body as is", async (s) => {
    upstream(() => Response.json({ error: `e${s}` }, { status: s }));
    const response = await call(request());
    expect(response.status).toBe(s);
    expect(await response.json()).toEqual({ error: `e${s}` });
  });

  it("passes every Set-Cookie through untouched", async () => {
    const a =
      "stories_studio_session=abc; Path=/; Expires=Sat, 16 Aug 2026 00:00:00 GMT; HttpOnly; SameSite=lax";
    const b = "other=1; Path=/";
    upstream(() => {
      const h = new Headers({ "content-type": "application/json" });
      h.append("set-cookie", a);
      h.append("set-cookie", b);
      return new Response("{}", { headers: h });
    });
    const response = await call(request());
    expect(response.headers.getSetCookie()).toEqual([a, b]);
  });

  it("answers 502 when Python is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed"))),
    );
    const response = await call(request());
    expect(response.status).toBe(502);
  });

  it("answers 503 when PYTHON_API_BASE_URL is unset", async () => {
    vi.stubEnv("PYTHON_API_BASE_URL", "");
    const response = await call(request());
    expect(response.status).toBe(503);
    expect(calls).toHaveLength(0);
  });
});

describe("publish id", () => {
  it("is URL-encoded into the Python path", async () => {
    await publish(request(), { params: Promise.resolve({ id: "a/b c" }) });
    expect(String(calls[0]![0])).toBe(`${BASE}/api/studio/documents/a%2Fb%20c/publish`);
  });
});
