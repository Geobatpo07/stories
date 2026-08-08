import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BuildPipelineResult } from "@/build";
import { FixedClock, FileSystemPersistenceAdapter, IdentifierService } from "@/runtime";
import { KnowledgeObjectRepository } from "./repository";
import { MDXRenderer } from "./renderers";
import { AuthoringWorkflow } from "./workflow";

const directories: string[] = [];
afterEach(() =>
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })),
);

describe("AuthoringWorkflow", () => {
  it("autosaves a partial draft without generating MDX", async () => {
    const { root, repository, workflow } = setup();
    const draft = workflow.createDraft("note");
    const saved = await workflow.saveDraft({
      ...draft,
      fields: { title: "Early observation" },
      content: "Unfinished",
    });
    expect(saved.document.publicationState).toBe("draft");
    expect(saved.validation.success).toBe(false);
    expect(await repository.find(draft.id)).toBeDefined();
    expect(existsSync(join(root, "content", "notes"))).toBe(false);
  });

  it("publishes validated knowledge through MDX and the artifact build", async () => {
    const build = vi.fn(async () => successfulBuild());
    const { root, repository, workflow } = setup(build);
    const draft = workflow.createDraft("software");
    await workflow.saveDraft({
      ...draft,
      fields: fields({ title: "Research Tool", slug: "research-tool" }),
      content: "A reproducible research tool.",
    });
    const result = await workflow.publish(draft.id);
    expect(build).toHaveBeenCalledOnce();
    expect(result.document.publicationState).toBe("published");
    expect(readFileSync(join(root, "content", "software", "research-tool.mdx"), "utf8")).toContain(
      "A reproducible research tool.",
    );
    expect((await repository.find(draft.id))?.publication?.slug).toBe("research-tool");
  });

  it("restores the previous publication when the artifact build fails", async () => {
    const { root, workflow } = setup(async () => failedBuild());
    const target = join(root, "content", "software", "research-tool.mdx");
    mkdirSync(join(root, "content", "software"), { recursive: true });
    writeFileSync(target, "previous publication\n", "utf8");
    const draft = workflow.createDraft("software");
    await workflow.saveDraft({
      ...draft,
      fields: fields({ title: "Research Tool", slug: "research-tool" }),
      content: "Invalid update",
    });
    await expect(workflow.publish(draft.id)).rejects.toThrow("Publication validation failed");
    expect(readFileSync(target, "utf8")).toBe("previous publication\n");
  });
});

function setup(build: () => Promise<BuildPipelineResult> = async () => successfulBuild()) {
  const root = mkdtempSync(join(tmpdir(), "stories-authoring-"));
  directories.push(root);
  const repository = new KnowledgeObjectRepository(
    new FileSystemPersistenceAdapter(join(root, "knowledge")),
  );
  const workflow = new AuthoringWorkflow(
    repository,
    new MDXRenderer(),
    new FixedClock(new Date("2026-08-03T12:00:00.000Z")),
    new IdentifierService(),
    root,
    build,
  );
  return { root, repository, workflow };
}

function fields(extra: Readonly<Record<string, unknown>>) {
  return {
    description: "A research artifact.",
    date: "2026-08-03",
    status: "active",
    tags: [],
    ...extra,
  };
}

function successfulBuild(): BuildPipelineResult {
  return { success: true, report: report(true) };
}

function failedBuild(): BuildPipelineResult {
  return { success: false, report: report(false) };
}

function report(success: boolean): BuildPipelineResult["report"] {
  return {
    countsByKind: {},
    entityCount: 0,
    relationshipCount: 0,
    targetResults: [],
    validationIssues: success ? [] : [{ check: "publication", message: "Rejected update" }],
    elapsedMs: 1,
    success,
  };
}
