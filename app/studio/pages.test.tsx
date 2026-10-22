// The three Studio pages after the repoint: they read from the Python API, forwarding the session
// cookie, and fail visibly. Pages are async functions, so each is called directly and the element
// it returns is rendered to HTML. Only the boundaries are faked: next/headers and global fetch.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PythonApiError } from "@/lib/python-api";

const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "stories_studio_session" && cookieJar.value !== undefined
        ? { name, value: cookieJar.value }
        : undefined,
  }),
}));

import StudioPage from "./(protected)/page";
import StudioDocumentPage from "./(protected)/documents/[id]/page";
import NewStudioDocumentPage from "./(protected)/new/[kind]/page";

const BASE = "http://127.0.0.1:8000";
const TOKEN = "a".repeat(64);
const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const noteDefinition = {
  kind: "note",
  label: "Note",
  publicKind: "Note",
  fields: [
    { name: "title", label: "Title", type: "text", required: true },
    { name: "status", label: "Status", type: "text", defaultValue: "draft" },
    { name: "kicker", label: "Kicker", type: "text", defaultValue: "from-the-api" },
  ],
};
const definitions = [
  noteDefinition,
  { ...noteDefinition, kind: "experiment", label: "Experiment", publicKind: "Experiment" },
];
const document = (id: string, state: "draft" | "published", title: string) => ({
  version: 1,
  id,
  kind: "note",
  publicationState: state,
  fields: { title, slug: title.toLowerCase().replace(/ /g, "-") },
  content: "Body.",
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-02T09:00:00.000Z",
});
const documents = [
  document(ID, "draft", "Open Draft"),
  document(OTHER, "published", "Linked Note"),
];

type Handler = (url: string) => Response | Promise<Response>;
function stubPython(handler: Handler) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => handler(String(input)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const healthy: Handler = (url) =>
  url.endsWith("/api/studio/documents")
    ? Response.json({ documents })
    : url.endsWith("/api/authoring/definitions")
      ? Response.json(definitions)
      : new Response("?", { status: 500 });

const pages: readonly [string, () => Promise<unknown>][] = [
  ["home", () => StudioPage()],
  ["document", () => StudioDocumentPage({ params: Promise.resolve({ id: ID }) })],
  ["new", () => NewStudioDocumentPage({ params: Promise.resolve({ kind: "note" }) })],
];
const html = async (page: () => Promise<unknown>) =>
  renderToStaticMarkup((await page()) as React.ReactElement);

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

beforeEach(() => {
  vi.unstubAllGlobals();
  cookieJar.value = TOKEN;
  process.env.PYTHON_API_BASE_URL = `${BASE}/`;
});

describe("every page forwards the session cookie on every call to the Python API", () => {
  it.each(pages)("%s", async (_name, page) => {
    const fetchMock = stubPython(healthy);
    await page();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetchMock.mock.calls) {
      expect(String(url).startsWith(`${BASE}/api/`)).toBe(true);
      expect(init?.headers).toEqual({ cookie: `stories_studio_session=${TOKEN}` });
      expect(init?.cache).toBe("no-store");
    }
  });

  it("calls the documented endpoints, once each", async () => {
    const fetchMock = stubPython(healthy);
    await StudioPage();
    expect(fetchMock.mock.calls.map(([url]) => String(url)).sort()).toEqual([
      `${BASE}/api/authoring/definitions`,
      `${BASE}/api/studio/documents`,
    ]);
  });

  it("sends no cookie header at all when the visitor has no session cookie", async () => {
    cookieJar.value = undefined;
    const fetchMock = stubPython(healthy);
    await StudioPage();
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({});
  });
});

describe("happy path", () => {
  it("home lists the documents and one card per allowed kind", async () => {
    stubPython(healthy);
    const markup = await html(() => StudioPage());
    expect(markup).toContain("Open Draft");
    expect(markup).toContain("Linked Note");
    expect(markup).toContain("2 records");
    expect(markup).toContain('href="/studio/new/note"');
    expect(markup).not.toContain("/studio/new/experiment"); // not an editable Studio kind
  });

  it("document page renders the editor for the requested id", async () => {
    stubPython(healthy);
    const markup = await html(() => StudioDocumentPage({ params: Promise.resolve({ id: ID }) }));
    expect(markup).toContain("Open Draft");
  });

  it("document page offers published documents, and not itself, as relationships", async () => {
    stubPython(healthy);
    const element = (await StudioDocumentPage({
      params: Promise.resolve({ id: OTHER }),
    })) as React.ReactElement<{
      children: React.ReactElement<{ relationshipOptions: unknown }>;
    }>;
    // OTHER is the only published document, and it is the one being edited: nothing to link to.
    expect(element.props.children.props.relationshipOptions).toEqual([]);
    const draftPage = (await StudioDocumentPage({
      params: Promise.resolve({ id: ID }),
    })) as typeof element;
    expect(draftPage.props.children.props.relationshipOptions).toEqual([
      { kind: "note", slug: "linked-note", title: "Linked Note" },
    ]);
  });

  it("new page builds a draft from the field defaults the API returned", async () => {
    stubPython(healthy);
    const element = (await NewStudioDocumentPage({
      params: Promise.resolve({ kind: "note" }),
    })) as React.ReactElement<{
      children: React.ReactElement<{ initialDocument: Record<string, unknown> }>;
    }>;
    const draft = element.props.children.props.initialDocument as {
      kind: string;
      publicationState: string;
      id: string;
      fields: Record<string, unknown>;
    };
    expect(draft.kind).toBe("note");
    expect(draft.publicationState).toBe("draft");
    expect(draft.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(draft.fields).toMatchObject({ status: "draft", kicker: "from-the-api", tags: [] });
  });
});

describe("failure is a real error, never an empty page", () => {
  it.each(pages)("%s: an unreachable API throws a PythonApiError", async (_name, page) => {
    stubPython(() => {
      throw new TypeError("fetch failed");
    });
    await expect(page()).rejects.toThrow(PythonApiError);
    await expect(page()).rejects.toThrow(/unreachable at http:\/\/127\.0\.0\.1:8000/);
  });

  it.each(pages)("%s: a 500 throws, with the status", async (_name, page) => {
    stubPython(() => Response.json({ error: "boom" }, { status: 500 }));
    await expect(page()).rejects.toMatchObject({ name: "PythonApiError", status: 500 });
  });

  it.each(pages)("%s: an unset PYTHON_API_BASE_URL throws before any request", async (_n, page) => {
    delete process.env.PYTHON_API_BASE_URL;
    const fetchMock = stubPython(healthy);
    await expect(page()).rejects.toThrow("PYTHON_API_BASE_URL is not set.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a 401 sends the visitor to the login page", async () => {
    stubPython(() => Response.json({ error: "Unauthorized" }, { status: 401 }));
    await expect(StudioPage()).rejects.toMatchObject({
      digest: expect.stringContaining("/studio/login"),
    });
  });

  it("the Studio being disabled (404 with the API body) is a not-found page", async () => {
    stubPython(() => Response.json({ error: "Not found" }, { status: 404 }));
    await expect(StudioPage()).rejects.toMatchObject(NOT_FOUND);
  });

  it("a route the API lacks (FastAPI 404) is an error, not a not-found page", async () => {
    stubPython(() => Response.json({ detail: "Not Found" }, { status: 404 }));
    await expect(StudioPage()).rejects.toThrow(PythonApiError);
  });

  it("an unknown document id is a not-found page", async () => {
    stubPython(healthy);
    const params = Promise.resolve({ id: "99999999-9999-4999-8999-999999999999" });
    await expect(StudioDocumentPage({ params })).rejects.toMatchObject(NOT_FOUND);
  });

  it("an unknown or non-editable kind is a not-found page without calling the API", async () => {
    const fetchMock = stubPython(healthy);
    for (const kind of ["experiment", "nonsense"]) {
      const params = Promise.resolve({ kind });
      await expect(NewStudioDocumentPage({ params })).rejects.toMatchObject(NOT_FOUND);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
