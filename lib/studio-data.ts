import type { AuthoringDocument, AuthoringEntityDefinition } from "@/authoring";
import type { RelationshipOption } from "@/components/authoring/studio-editor";
import { pythonApiGet } from "./python-api";

export async function listStudioDocuments(): Promise<readonly AuthoringDocument[]> {
  const { documents } = await pythonApiGet<{ documents: AuthoringDocument[] }>(
    "/api/studio/documents",
  );
  return documents;
}

export function listStudioDefinitions(): Promise<readonly AuthoringEntityDefinition[]> {
  return pythonApiGet<AuthoringEntityDefinition[]>("/api/authoring/definitions");
}

/** Published records another document can link to, optionally without the document itself. */
export function publishedRelationshipOptions(
  documents: readonly AuthoringDocument[],
  excludeId?: string,
): readonly RelationshipOption[] {
  return documents
    .filter(
      (item) =>
        item.publicationState === "published" &&
        typeof item.fields.slug === "string" &&
        item.id !== excludeId,
    )
    .map((item) => ({
      kind: item.kind,
      slug: String(item.fields.slug),
      title: String(item.fields.title ?? item.fields.slug),
    }));
}

/** A blank draft for a new document. Same shape as `AuthoringWorkflow.createDraft`: the API has
 *  no draft-creation route (a draft only exists once the editor first saves it). */
export function newStudioDraft(definition: AuthoringEntityDefinition): AuthoringDocument {
  const now = new Date().toISOString();
  const defaults = Object.fromEntries(
    definition.fields
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.name, field.defaultValue]),
  );
  return {
    version: 1,
    id: crypto.randomUUID(),
    kind: definition.kind,
    publicationState: "draft",
    fields: { date: now.slice(0, 10), status: "draft", tags: [], ...defaults },
    content: "",
    createdAt: now,
    updatedAt: now,
  };
}
