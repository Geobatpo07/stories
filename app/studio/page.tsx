import Link from "next/link";
import type { Route } from "next";
import { listAuthoringDefinitions } from "@/kernel";
import { knowledgeObjectRepository } from "@/authoring/server";

const STUDIO_KINDS = new Set([
  "program",
  "question",
  "note",
  "software",
  "publication",
  "dataset",
  "presentation",
]);

export default async function StudioPage() {
  const documents = await knowledgeObjectRepository.list();
  const definitions = listAuthoringDefinitions().filter((item) => STUDIO_KINDS.has(item.kind));
  return (
    <main id="main-content" className="shell page studio-home">
      <header className="page-hero compact-hero">
        <p className="eyebrow">Private workspace</p>
        <h1>Knowledge Authoring Studio</h1>
        <p>
          Shape research as knowledge objects. Draft privately, validate continuously, and publish
          clean MDX when the work is ready.
        </p>
      </header>
      <section className="studio-create" aria-labelledby="create-title">
        <h2 id="create-title">Begin a knowledge object</h2>
        <div className="studio-kind-grid">
          {definitions.map((definition) => (
            <Link key={definition.kind} href={`/studio/new/${definition.kind}` as Route}>
              <small>{definition.publicKind}</small>
              <strong>
                {definition.publicKind === "Artifact" ? definition.label : definition.publicKind}
              </strong>
              <span>Open a focused writing space →</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="studio-library" aria-labelledby="drafts-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Working library</p>
            <h2 id="drafts-title">Knowledge objects</h2>
          </div>
          <p>
            {documents.length} record{documents.length === 1 ? "" : "s"}
          </p>
        </div>
        {documents.length ? (
          <ol>
            {documents.map((document) => (
              <li key={document.id}>
                <Link href={`/studio/documents/${document.id}` as Route}>
                  <span>
                    <small>
                      {document.kind} · {document.publicationState}
                    </small>
                    <strong>{String(document.fields.title ?? "Untitled research")}</strong>
                  </span>
                  <time dateTime={document.updatedAt}>
                    {new Date(document.updatedAt).toLocaleString("en", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">
            The workspace is clear. Begin with the research object you need now.
          </p>
        )}
      </section>
    </main>
  );
}
