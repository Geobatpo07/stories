import type * as Support from "@/app/api/test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization of GET/POST /api/studio/documents (ADR-004 Phase 4 step 1,
// backend/PHASE4-AUDIT.md). Auth, storage and the Studio feature flag are real code paths; only
// Supabase, Resend and the cookie store are in-memory fakes.
vi.mock("next/headers", async () => (await import("@/app/api/test-support")).nextHeadersMock);
vi.mock(
  "@/runtime/adapters/supabase-persistence-adapter",
  async () => (await import("@/app/api/test-support")).supabaseAdapterMock,
);
vi.mock(
  "@/runtime/adapters/resend-email-adapter",
  async () => (await import("@/app/api/test-support")).resendAdapterMock,
);

const NOW = new Date("2026-08-15T12:00:00.000Z");
const SESSION = "5".repeat(64);
const COOKIE = "stories_studio_session";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";
const CREATED = "2026-08-01T09:00:00.000Z";

async function load(env: Record<string, string> = {}, signedIn = true) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const route = await import("./route");
  if (signedIn) {
    support.seedSession(SESSION, NOW, new Date(NOW.getTime() + 3_600_000));
    support.jar.request.set(COOKIE, SESSION);
  }
  return { support, ...route };
}

function draft(overrides: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    kind: "software",
    fields: {
      title: "Research Tool",
      slug: "research-tool",
      description: "A research artifact.",
      date: "2026-08-03",
      status: "active",
      tags: [],
    },
    content: "Body text",
    createdAt: CREATED,
    ...overrides,
  };
}

const post = (support: typeof Support, body: unknown) =>
  support.jsonRequest("http://localhost/api/studio/documents", body);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("studio documents: feature flag and session gate (GET and POST)", () => {
  it("answers 404 {error:'Not found'} in production unless STORIES_STUDIO_ENABLED is exactly 'true'", async () => {
    for (const value of [undefined, "1", "TRUE", "false"]) {
      vi.unstubAllEnvs();
      vi.stubEnv("NODE_ENV", "production");
      if (value !== undefined) vi.stubEnv("STORIES_STUDIO_ENABLED", value);
      const { GET, POST, support } = await load();
      for (const response of [await GET(), await POST(post(support, draft()))]) {
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: "Not found" });
      }
    }
  });

  it("is enabled in production with STORIES_STUDIO_ENABLED=true", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await load({ STORIES_STUDIO_ENABLED: "true" });
    expect((await GET()).status).toBe(200);
  });

  it("checks the feature flag before the session (404 even without a cookie)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { GET } = await load({}, false);
    expect((await GET()).status).toBe(404);
  });

  it("answers 401 {error:'Unauthorized'} without a session cookie", async () => {
    const { GET, POST, support } = await load({}, false);
    for (const response of [await GET(), await POST(post(support, draft()))]) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("answers 401 for an unknown token", async () => {
    const { GET, support } = await load({}, false);
    support.jar.request.set(COOKIE, "9".repeat(64));
    expect((await GET()).status).toBe(401);
  });

  it("answers 401 for an expired session and deletes its row as a side effect", async () => {
    const { GET, support } = await load();
    vi.setSystemTime(new Date(NOW.getTime() + 3_600_000));
    expect((await GET()).status).toBe(401);
    expect(support.rowsOf("auth", "auth-sessions")).toEqual({});
  });

  it("checks the session before validating the body (401 beats 400)", async () => {
    const { POST, support } = await load({}, false);
    expect((await POST(post(support, { nonsense: true }))).status).toBe(401);
  });
});

describe("GET /api/studio/documents", () => {
  it("answers 200 {documents: []} when nothing is stored", async () => {
    const { GET } = await load();
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ documents: [] });
  });

  it("lists drafts of every kind, newest updatedAt first, ties broken by id", async () => {
    const { GET, POST, support } = await load();
    vi.setSystemTime(new Date("2026-08-15T10:00:00.000Z"));
    await POST(post(support, draft({ id: ID_B, kind: "note" })));
    vi.setSystemTime(new Date("2026-08-15T11:00:00.000Z"));
    await POST(post(support, draft({ id: ID_C })));
    await POST(post(support, draft({ id: ID_A, kind: "dataset" })));
    const { documents } = (await (await GET()).json()) as {
      documents: { id: string; kind: string; updatedAt: string }[];
    };
    expect(documents.map((d) => [d.id, d.kind, d.updatedAt])).toEqual([
      [ID_A, "dataset", "2026-08-15T11:00:00.000Z"],
      [ID_C, "software", "2026-08-15T11:00:00.000Z"],
      [ID_B, "note", "2026-08-15T10:00:00.000Z"],
    ]);
  });

  it("lets a stored row that fails the document schema escape as an exception (500)", async () => {
    const { GET, support } = await load();
    support.putRow("knowledge", "software", ID_A, { version: 2, id: ID_A });
    await expect(GET()).rejects.toThrow();
  });
});

describe("POST /api/studio/documents: validation of the payload", () => {
  const broken: [string, Record<string, unknown>][] = [
    ["id that is not a UUID", { id: "not-a-uuid" }],
    ["missing id", { id: undefined }],
    ["unknown kind", { kind: "essay" }],
    ["fields that are not an object", { fields: "title" }],
    ["missing content", { content: undefined }],
    ["createdAt that is not an ISO datetime", { createdAt: "yesterday" }],
    ["publicationState outside the enum", { publicationState: "archived" }],
    ["publication with an empty-kind object", { publication: { kind: "software" } }],
  ];
  it.each(broken)("answers 400 for %s and stores nothing", async (_name, override) => {
    const { POST, support } = await load();
    const response = await POST(post(support, draft(override)));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "The draft payload is incomplete." });
    expect(support.rowsOf("knowledge")).toEqual({});
  });

  it("lets a malformed JSON body escape as an exception (Next turns it into a 500)", async () => {
    const { POST, support } = await load();
    await expect(POST(post(support, "{oops"))).rejects.toThrow(SyntaxError);
  });
});

describe("POST /api/studio/documents: saving", () => {
  it("answers 200 {document, validation} and stores the draft under knowledge/<kind>/<id>", async () => {
    const { POST, support } = await load();
    const response = await POST(post(support, draft()));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      document: Record<string, unknown>;
      validation: Record<string, unknown>;
    };
    expect(body.document).toEqual({
      version: 1,
      id: ID_A,
      kind: "software",
      publicationState: "draft",
      fields: draft().fields,
      content: "Body text",
      createdAt: CREATED,
      updatedAt: NOW.toISOString(),
    });
    expect(body.validation).toMatchObject({ success: true, issues: [] });
    expect(support.rowsOf("knowledge")).toEqual({ [`knowledge/software/${ID_A}`]: body.document });
  });

  it("stores a partial draft and reports friendly validation issues instead of failing", async () => {
    const { POST, support } = await load();
    const response = await POST(
      post(support, draft({ id: ID_B, kind: "note", fields: { title: "Early observation" } })),
    );
    expect(response.status).toBe(200);
    const { validation } = (await response.json()) as {
      validation: { success: boolean; issues: { field: string; message: string }[] };
    };
    expect(validation.success).toBe(false);
    expect(validation.issues.length).toBeGreaterThan(0);
    expect(validation.issues.every((i) => typeof i.field === "string" && i.message)).toBe(true);
    expect(Object.keys(support.rowsOf("knowledge"))).toEqual([`knowledge/note/${ID_B}`]);
  });

  it("generates the slug from the title when slug is absent or empty", async () => {
    const { POST, support } = await load();
    for (const slug of [undefined, ""]) {
      const fields = { ...draft().fields, title: "My  Research Tool!", slug };
      const response = await POST(post(support, draft({ fields })));
      const { document } = (await response.json()) as { document: { fields: { slug: string } } };
      expect(document.fields.slug).toBe("my-research-tool");
    }
  });

  it("keeps a slug the client sent, verbatim", async () => {
    const { POST, support } = await load();
    const fields = { ...draft().fields, slug: "Custom_Slug" };
    const { document } = (await (await POST(post(support, draft({ fields })))).json()) as {
      document: { fields: { slug: string } };
    };
    expect(document.fields.slug).toBe("Custom_Slug");
  });

  it("does not generate a slug from a blank or non-string title", async () => {
    const { POST, support } = await load();
    for (const title of ["   ", 42]) {
      const fields = { description: "x", title };
      const { document } = (await (await POST(post(support, draft({ fields })))).json()) as {
        document: { fields: Record<string, unknown> };
      };
      expect("slug" in document.fields).toBe(false);
    }
  });

  it("keeps the original createdAt and publicationState on a re-save, bumping updatedAt", async () => {
    const { POST, support } = await load();
    await POST(post(support, draft()));
    vi.setSystemTime(new Date("2026-08-15T12:30:00.000Z"));
    const resaved = await POST(
      post(support, draft({ createdAt: "2030-01-01T00:00:00.000Z", content: "v2" })),
    );
    const { document } = (await resaved.json()) as { document: Record<string, unknown> };
    expect(document).toMatchObject({
      createdAt: CREATED,
      updatedAt: "2026-08-15T12:30:00.000Z",
      publicationState: "draft",
      content: "v2",
    });
    expect(Object.keys(support.rowsOf("knowledge"))).toHaveLength(1);
  });

  it("trusts a client-supplied publicationState and publication (quirk: no publish step needed)", async () => {
    const { POST, support } = await load();
    const publication = {
      kind: "software",
      slug: "research-tool",
      path: "content/software/research-tool.mdx",
      publishedAt: "2026-08-02T00:00:00.000Z",
    };
    const { document } = (await (
      await POST(post(support, draft({ publicationState: "published", publication })))
    ).json()) as { document: Record<string, unknown> };
    expect(document).toMatchObject({ publicationState: "published", publication });
  });

  it("writes only into the 'knowledge' namespace and never touches auth rows", async () => {
    const { POST, support } = await load();
    const authBefore = support.rowsOf("auth");
    await POST(post(support, draft()));
    expect(support.rowsOf("auth")).toEqual(authBefore);
    expect(support.persistenceConstructions.map((c) => c.namespace).sort()).toEqual([
      "auth",
      "knowledge",
    ]);
  });
});
