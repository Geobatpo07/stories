import { notFound } from "next/navigation";
import { getAuthoringDefinition } from "@/kernel";
import { knowledgeObjectRepository } from "@/authoring/server";
import { StudioEditor, type RelationshipOption } from "@/components/authoring/studio-editor";

export default async function StudioDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const document = await knowledgeObjectRepository.find(id);
  if (!document) notFound();
  const options: RelationshipOption[] = (await knowledgeObjectRepository.list())
    .filter(
      (item) =>
        item.publicationState === "published" &&
        typeof item.fields.slug === "string" &&
        item.id !== document.id,
    )
    .map((item) => ({
      kind: item.kind,
      slug: String(item.fields.slug),
      title: String(item.fields.title ?? item.fields.slug),
    }));
  return (
    <main id="main-content" className="studio-page">
      <StudioEditor
        initialDocument={document}
        definition={getAuthoringDefinition(document.kind)}
        relationshipOptions={options}
      />
    </main>
  );
}
