import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Characterization of POST /api/studio/documents/[id]/publish (ADR-004 Phase 4 step 1,
// backend/PHASE4-AUDIT.md). The route, AuthoringWorkflow, MDXRenderer, the Kernel and the real
// TypeScript build pipeline all run for real, inside a throwaway project root (process.chdir),
// so the file writes, the build, and the rollback `restore()` calls are genuinely exercised.
// Only Supabase, Resend, cookies and the Next.js / presentation cache hooks are faked.
vi.mock("next/headers", async () => (await import("@/app/api/test-support")).nextHeadersMock);
vi.mock(
  "@/runtime/adapters/supabase-persistence-adapter",
  async () => (await import("@/app/api/test-support")).supabaseAdapterMock,
);
vi.mock(
  "@/runtime/adapters/resend-email-adapter",
  async () => (await import("@/app/api/test-support")).resendAdapterMock,
);
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/presentation/runtime", () => ({ resetRuntimeContext: vi.fn() }));
vi.mock("@/lib/presentation", () => ({ resetLaboratory: vi.fn() }));

const NOW = new Date("2026-08-15T12:00:00.000Z");
const SESSION = "6".repeat(64);
const COOKIE = "stories_studio_session";
const ID = "44444444-4444-4444-8444-444444444444";
const CREATED = "2026-08-01T09:00:00.000Z";

const CONTENT_DIRECTORIES = [
  "programs",
  "questions",
  "hypotheses",
  "experiments",
  "notes",
  "software",
  "publications",
  "datasets",
  "presentations",
];
const originalCwd = process.cwd();
const directories: string[] = [];

function fields(extra: Record<string, unknown> = {}) {
  return {
    title: "Research Tool",
    slug: "research-tool",
    description: "A research artifact.",
    date: "2026-08-03",
    status: "active",
    tags: [],
    ...extra,
  };
}

function storedDraft(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    id: ID,
    kind: "software",
    publicationState: "draft",
    fields: fields(),
    content: "A reproducible research tool.",
    createdAt: CREATED,
    updatedAt: CREATED,
    ...overrides,
  };
}

async function load(env: Record<string, string> = {}) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
  const root = mkdtempSync(join(tmpdir(), "stories-publish-"));
  directories.push(root);
  // The Kernel treats a missing registered content directory as a build failure (ENOENT), so a
  // realistic empty project root has all nine of them.
  for (const directory of CONTENT_DIRECTORIES) {
    mkdirSync(join(root, "content", directory), { recursive: true });
  }
  process.chdir(root);
  vi.resetModules();
  const support = await import("@/app/api/test-support");
  support.resetFakes();
  const { POST } = await import("./route");
  const { revalidatePath } = await import("next/cache");
  const { resetRuntimeContext } = await import("@/lib/presentation/runtime");
  const { resetLaboratory } = await import("@/lib/presentation");
  for (const mock of [revalidatePath, resetRuntimeContext, resetLaboratory]) {
    (mock as ReturnType<typeof vi.fn>).mockClear();
  }
  support.seedSession(SESSION, NOW, new Date(NOW.getTime() + 3_600_000));
  support.jar.request.set(COOKIE, SESSION);
  const publish = (id: string = ID) =>
    POST(new Request(`http://localhost/api/studio/documents/${id}/publish`, { method: "POST" }), {
      params: Promise.resolve({ id }),
    });
  return { support, root, publish, revalidatePath, resetRuntimeContext, resetLaboratory };
}

function write(root: string, relative: string, text: string) {
  const path = join(root, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text, "utf8");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubEnv("NODE_ENV", "test");
});
afterEach(() => {
  process.chdir(originalCwd);
  vi.useRealTimers();
  vi.unstubAllEnvs();
  directories.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true }));
});

describe("publish: gates", () => {
  it("answers 404 {error:'Not found'} when the Studio is disabled, before looking at the session", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { publish, support } = await load();
    support.jar.request.clear();
    const response = await publish();
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  it("answers 401 {error:'Unauthorized'} without a session and writes nothing", async () => {
    const { publish, support, root, revalidatePath } = await load();
    support.putRow("knowledge", "software", ID, storedDraft());
    support.jar.request.clear();
    const response = await publish();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(existsSync(join(root, "content/software/research-tool.mdx"))).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers 422 with the plain message when the draft does not exist", async () => {
    const { publish, revalidatePath } = await load();
    const response = await publish();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "The draft could not be found." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers 422 with 'field: message' pairs joined by '; ' when the draft is incomplete", async () => {
    const { publish, support, root } = await load();
    support.putRow(
      "knowledge",
      "software",
      ID,
      storedDraft({ fields: { title: "Only a title", slug: "only-a-title" } }),
    );
    const response = await publish();
    expect(response.status).toBe(422);
    const { error } = (await response.json()) as { error: string };
    expect(error).toMatch(/^[a-zA-Z.]+: .+/);
    expect(error).toContain("; ");
    expect(existsSync(join(root, "content/software/research-tool.mdx"))).toBe(false);
  });
});

describe("publish: success", () => {
  it("writes the MDX, rebuilds the artifact, marks the draft published and refreshes the caches", async () => {
    const { publish, support, root, revalidatePath, resetRuntimeContext, resetLaboratory } =
      await load();
    support.putRow("knowledge", "software", ID, storedDraft());
    const response = await publish();
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      document: Record<string, unknown>;
      report: Record<string, unknown>;
    };

    expect(body.document).toEqual({
      ...storedDraft(),
      publicationState: "published",
      updatedAt: NOW.toISOString(),
      publication: {
        kind: "software",
        slug: "research-tool",
        path: "content/software/research-tool.mdx",
        publishedAt: NOW.toISOString(),
      },
    });
    expect(support.rowsOf("knowledge")[`knowledge/software/${ID}`]).toEqual(body.document);

    expect(readFileSync(join(root, "content/software/research-tool.mdx"), "utf8")).toBe(
      [
        "---",
        'title: "Research Tool"',
        'slug: "research-tool"',
        'description: "A research artifact."',
        'date: "2026-08-03"',
        'status: "active"',
        "tags: []",
        "---",
        "",
        "A reproducible research tool.",
        "",
      ].join("\n"),
    );
    expect(existsSync(join(root, "database/generated/knowledge.duckdb"))).toBe(true);
    expect(
      JSON.parse(readFileSync(join(root, "database/generated/manifest.json"), "utf8")),
    ).toMatchObject({ knowledge: { entities: 1, relationships: 0 } });
    expect(body.report).toMatchObject({
      success: true,
      entityCount: 1,
      relationshipCount: 0,
      countsByKind: { software: 1 },
      validationIssues: [],
    });
    expect(
      (body.report.targetResults as { name: string; success: boolean }[]).map((t) => [
        t.name,
        t.success,
      ]),
    ).toEqual([
      ["duckdb", true],
      ["manifest", true],
    ]);

    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(resetRuntimeContext).toHaveBeenCalledTimes(1);
    expect(resetLaboratory).toHaveBeenCalledTimes(1);
  });

  it("moves the file and deletes the previous one when the slug changed since the last publication", async () => {
    const { publish, support, root } = await load();
    write(root, "content/software/old-name.mdx", "old publication\n");
    support.putRow(
      "knowledge",
      "software",
      ID,
      storedDraft({
        publicationState: "published",
        publication: {
          kind: "software",
          slug: "old-name",
          path: "content/software/old-name.mdx",
          publishedAt: "2026-08-02T00:00:00.000Z",
        },
      }),
    );
    const response = await publish();
    expect(response.status).toBe(200);
    expect(existsSync(join(root, "content/software/old-name.mdx"))).toBe(false);
    expect(existsSync(join(root, "content/software/research-tool.mdx"))).toBe(true);
  });
});

describe("publish: rollback when the artifact build fails", () => {
  const BROKEN = "---\ntitle: [unterminated\n---\n";

  it("deletes a newly written file, answers 422 with the build report, and refreshes nothing", async () => {
    const { publish, support, root, revalidatePath, resetRuntimeContext, resetLaboratory } =
      await load();
    write(root, "content/notes/broken.mdx", BROKEN);
    support.putRow("knowledge", "software", ID, storedDraft());
    const response = await publish();
    expect(response.status).toBe(422);
    const { error } = (await response.json()) as { error: string };
    expect(error.startsWith("Publication validation failed.\n")).toBe(true);
    expect(error).toContain("Build failed");
    expect(error).toContain("[kernel]");
    expect(error).toContain("broken.mdx");
    expect(existsSync(join(root, "content/software/research-tool.mdx"))).toBe(false);
    expect(readFileSync(join(root, "content/notes/broken.mdx"), "utf8")).toBe(BROKEN);
    expect(support.rowsOf("knowledge")[`knowledge/software/${ID}`]).toEqual(storedDraft());
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(resetRuntimeContext).not.toHaveBeenCalled();
    expect(resetLaboratory).not.toHaveBeenCalled();
  });

  it("restores the previous bytes of an overwritten file", async () => {
    const { publish, support, root } = await load();
    write(root, "content/notes/broken.mdx", BROKEN);
    write(root, "content/software/research-tool.mdx", "previous publication\r\nwith CRLF\r\n");
    support.putRow("knowledge", "software", ID, storedDraft());
    expect((await publish()).status).toBe(422);
    expect(readFileSync(join(root, "content/software/research-tool.mdx"), "utf8")).toBe(
      "previous publication\r\nwith CRLF\r\n",
    );
  });

  it("restores the previous file and removes the new one when a slug change fails to build", async () => {
    const { publish, support, root } = await load();
    write(root, "content/notes/broken.mdx", BROKEN);
    write(root, "content/software/old-name.mdx", "old publication\n");
    support.putRow(
      "knowledge",
      "software",
      ID,
      storedDraft({
        publicationState: "published",
        publication: {
          kind: "software",
          slug: "old-name",
          path: "content/software/old-name.mdx",
          publishedAt: "2026-08-02T00:00:00.000Z",
        },
      }),
    );
    expect((await publish()).status).toBe(422);
    expect(readFileSync(join(root, "content/software/old-name.mdx"), "utf8")).toBe(
      "old publication\n",
    );
    expect(existsSync(join(root, "content/software/research-tool.mdx"))).toBe(false);
  });
});

describe("publish: path safety", () => {
  it("refuses a recorded publication path that leaves the project root and writes nothing", async () => {
    const { publish, support, root, revalidatePath } = await load();
    support.putRow(
      "knowledge",
      "software",
      ID,
      storedDraft({
        publication: {
          kind: "software",
          slug: "x",
          path: "../escape.mdx",
          publishedAt: "2026-08-02T00:00:00.000Z",
        },
      }),
    );
    const response = await publish();
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: "Publication path leaves the project root." });
    expect(existsSync(join(root, "content/software/research-tool.mdx"))).toBe(false);
    expect(existsSync(join(root, "..", "escape.mdx"))).toBe(false);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
