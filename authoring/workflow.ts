import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import {
  getAuthoringDefinition,
  materializeAuthoringObjects,
  resetKernelCache,
  validateAuthoringFields,
} from "@/kernel";
import type { ClockPort, IdentifierPort } from "@/runtime";
import { renderReport, runBuildPipeline } from "@/build";
import type { BuildPipelineResult } from "@/build";
import type { KnowledgeObjectRepository } from "./repository";
import type { AuthoringDocument, DocumentValidation, DraftInput, KnowledgeRenderer } from "./types";

export class AuthoringWorkflow {
  private readonly root: string;

  constructor(
    private readonly repository: KnowledgeObjectRepository,
    private readonly renderer: KnowledgeRenderer,
    private readonly clock: ClockPort,
    private readonly identifier: IdentifierPort,
    root = process.cwd(),
    private readonly build: () => Promise<BuildPipelineResult> = () => runBuildPipeline(),
  ) {
    this.root = resolve(root);
  }

  createDraft(kind: AuthoringDocument["kind"]): AuthoringDocument {
    const now = this.clock.now().toISOString();
    const defaults = Object.fromEntries(
      getAuthoringDefinition(kind)
        .fields.filter((field) => field.defaultValue !== undefined)
        .map((field) => [field.name, field.defaultValue]),
    );
    return {
      version: 1,
      id: randomUUID(),
      kind,
      publicationState: "draft",
      fields: { date: now.slice(0, 10), status: "draft", tags: [], ...defaults },
      content: "",
      createdAt: now,
      updatedAt: now,
    };
  }

  slugFromTitle(title: string): string {
    return this.identifier.normalizeSlug(title);
  }

  async saveDraft(
    input: DraftInput,
  ): Promise<{ document: AuthoringDocument; validation: DocumentValidation }> {
    const existing = await this.repository.find(input.id);
    const now = this.clock.now().toISOString();
    const document: AuthoringDocument = {
      version: 1,
      id: input.id,
      kind: input.kind,
      publicationState: input.publicationState ?? existing?.publicationState ?? "draft",
      fields: { ...input.fields },
      content: input.content,
      createdAt: existing?.createdAt ?? input.createdAt,
      updatedAt: now,
      publication: input.publication ?? existing?.publication,
    };
    await this.repository.save(document);
    return { document, validation: this.validate(document, await this.repository.list()) };
  }

  validate(document: AuthoringDocument, all: readonly AuthoringDocument[]): DocumentValidation {
    const fieldValidation = validateAuthoringFields(document.kind, document.fields);
    if (!fieldValidation.success || !fieldValidation.data) {
      return { success: false, issues: fieldValidation.issues };
    }
    try {
      const publishable = all
        .filter((item) => item.publicationState === "published" && item.id !== document.id)
        .concat(document)
        .map((item) => ({
          kind: item.kind,
          fields: item.id === document.id ? fieldValidation.data! : item.fields,
          content: item.content,
        }));
      materializeAuthoringObjects(publishable);
      return { success: true, issues: [], normalizedFields: fieldValidation.data };
    } catch (error) {
      return {
        success: false,
        issues: [{ field: "relationships", message: friendlyRelationshipMessage(error) }],
      };
    }
  }

  async publish(id: string): Promise<{ document: AuthoringDocument; report: BuildPipelineResult }> {
    const document = await this.repository.find(id);
    if (!document) throw new Error("The draft could not be found.");
    const all = await this.repository.list();
    const validation = this.validate(document, all);
    if (!validation.success || !validation.normalizedFields) {
      throw new Error(
        validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
      );
    }
    const normalized = { ...document, fields: validation.normalizedFields };
    const rendered = await this.renderer.render(normalized);
    const target = this.publicationPath(rendered.relativePath);
    const previous = document.publication?.path
      ? this.publicationPath(document.publication.path)
      : undefined;
    const targetBackup = await optionalRead(target);
    const previousBackup =
      previous && previous !== target ? await optionalRead(previous) : undefined;

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, rendered.content, "utf8");
    if (previous && previous !== target) await optionalDelete(previous);

    resetKernelCache();
    const report = await this.build();
    if (!report.success) {
      await restore(target, targetBackup);
      if (previous && previous !== target) await restore(previous, previousBackup);
      resetKernelCache();
      throw new Error(`Publication validation failed.\n${renderReport(report.report)}`);
    }

    const now = this.clock.now().toISOString();
    const published: AuthoringDocument = {
      ...normalized,
      publicationState: "published",
      updatedAt: now,
      publication: {
        kind: document.kind,
        slug: String(validation.normalizedFields.slug),
        path: rendered.relativePath.replace(/\\/g, "/"),
        publishedAt: now,
      },
    };
    await this.repository.save(published);
    return { document: published, report };
  }

  private publicationPath(relativePath: string): string {
    const path = resolve(this.root, relativePath);
    if (!path.startsWith(`${this.root}${sep}`))
      throw new Error("Publication path leaves the project root.");
    return path;
  }
}

async function optionalRead(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function optionalDelete(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}

async function restore(path: string, content: string | undefined): Promise<void> {
  if (content === undefined) return optionalDelete(path);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function friendlyRelationshipMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const match = /field "([^"]+)" points to missing target "([^"]+)"/.exec(message);
  return match
    ? `Choose a published ${match[2]?.split(":")[0] ?? "knowledge"} record for ${match[1]}.`
    : "Review the selected relationships before publishing.";
}
