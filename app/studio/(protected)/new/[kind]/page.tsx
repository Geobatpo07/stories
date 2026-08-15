import { notFound } from "next/navigation";
import { getAuthoringDefinition, listAuthoringDefinitions, type EntityKind } from "@/kernel";
import { authoringWorkflow, knowledgeObjectRepository } from "@/authoring/server";
import { StudioEditor, type RelationshipOption } from "@/components/authoring/studio-editor";

const EDITABLE = new Set([
  "program",
  "question",
  "note",
  "software",
  "publication",
  "dataset",
  "presentation",
]);

export default async function NewStudioDocumentPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!EDITABLE.has(kind) || !listAuthoringDefinitions().some((item) => item.kind === kind))
    notFound();
  const definition = getAuthoringDefinition(kind as EntityKind);
  const document = authoringWorkflow.createDraft(definition.kind);
  const relationshipOptions = await publishedRelationshipOptions();
  return (
    <main id="main-content" className="studio-page">
      <StudioEditor
        initialDocument={document}
        definition={definition}
        relationshipOptions={relationshipOptions}
      />
    </main>
  );
}

async function publishedRelationshipOptions(): Promise<readonly RelationshipOption[]> {
  return (await knowledgeObjectRepository.list())
    .filter((item) => item.publicationState === "published" && typeof item.fields.slug === "string")
    .map((item) => ({
      kind: item.kind,
      slug: String(item.fields.slug),
      title: String(item.fields.title ?? item.fields.slug),
    }));
}
