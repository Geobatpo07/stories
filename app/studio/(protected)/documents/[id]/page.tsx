import { notFound } from "next/navigation";
import { StudioEditor } from "@/components/authoring/studio-editor";
import {
  listStudioDefinitions,
  listStudioDocuments,
  publishedRelationshipOptions,
} from "@/lib/studio-data";

export default async function StudioDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [documents, definitions] = await Promise.all([
    listStudioDocuments(),
    listStudioDefinitions(),
  ]);
  const document = documents.find((item) => item.id === id);
  if (!document) notFound();
  const definition = definitions.find((item) => item.kind === document.kind);
  if (!definition) throw new Error(`The Python API has no definition for kind ${document.kind}.`);
  return (
    <main id="main-content" className="studio-page">
      <StudioEditor
        initialDocument={document}
        definition={definition}
        relationshipOptions={publishedRelationshipOptions(documents, document.id)}
      />
    </main>
  );
}
