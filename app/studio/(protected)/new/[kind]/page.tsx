import { notFound } from "next/navigation";
import { StudioEditor } from "@/components/authoring/studio-editor";
import {
  listStudioDefinitions,
  listStudioDocuments,
  newStudioDraft,
  publishedRelationshipOptions,
} from "@/lib/studio-data";

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
  if (!EDITABLE.has(kind)) notFound();
  const [definitions, documents] = await Promise.all([
    listStudioDefinitions(),
    listStudioDocuments(),
  ]);
  const definition = definitions.find((item) => item.kind === kind);
  if (!definition) notFound();
  return (
    <main id="main-content" className="studio-page">
      <StudioEditor
        initialDocument={newStudioDraft(definition)}
        definition={definition}
        relationshipOptions={publishedRelationshipOptions(documents)}
      />
    </main>
  );
}
