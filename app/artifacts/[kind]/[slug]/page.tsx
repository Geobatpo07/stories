import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  DetailHeader,
  EntityBody,
  ExternalLinks,
  MetadataPanel,
} from "@/components/knowledge/detail";
import { KnowledgeDiscovery, ResearchNavigation } from "@/components/knowledge/research-navigation";
import { Breadcrumb } from "@/components/shared/primitives";
import {
  adjacentEntities,
  artifactLabel,
  entityHref,
  field,
  findEntity,
  getLaboratory,
} from "@/lib/presentation";
export async function generateStaticParams() {
  return (await getLaboratory()).artifacts.map(({ kind, slug }) => ({ kind, slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ kind: string; slug: string }>;
}): Promise<Metadata> {
  const { kind, slug } = await params;
  const item = findEntity((await getLaboratory()).artifacts, slug, kind);
  return item
    ? {
        title: item.title,
        description: item.summary,
        alternates: { canonical: `/artifacts/${kind}/${slug}` },
        openGraph: { title: item.title, description: item.summary, type: "article" },
      }
    : {};
}
export default async function ArtifactPage({
  params,
}: {
  params: Promise<{ kind: string; slug: string }>;
}) {
  const { kind, slug } = await params;
  const lab = await getLaboratory();
  const artifact = findEntity(lab.artifacts, slug, kind);
  if (!artifact) notFound();
  const related = lab.related(artifact);
  const program = related.find((item) => item.kind === "program");
  const project = related.find((item) => item.kind === "question");
  const stories = related.filter((item) => item.kind === "note");
  const extras = [
    ["Venue", field(artifact, "venue")],
    ["License", field(artifact, "license")],
    ["DOI", field(artifact, "doi")],
  ]
    .filter((item): item is string[] => Boolean(item[1]))
    .map(([label, value]) => ({ label: label ?? "", value: value ?? "" }));
  const schemaType =
    artifact.kind === "dataset"
      ? "Dataset"
      : artifact.kind === "software"
        ? "SoftwareSourceCode"
        : artifact.kind === "publication"
          ? "ScholarlyArticle"
          : "PresentationDigitalDocument";
  const adjacent = adjacentEntities(lab.artifacts, artifact);
  return (
    <main id="main-content">
      <div className="shell page">
        <Breadcrumb
          items={[
            { label: "Artifacts", href: "/artifacts" },
            { label: artifactLabel(artifact.kind) },
            { label: artifact.title },
          ]}
        />
        <div className="detail-layout">
          <div>
            <DetailHeader
              entity={artifact}
              label={artifactLabel(artifact.kind)}
              parent={
                project
                  ? { title: project.title, href: entityHref(project) }
                  : program
                    ? { title: program.title, href: entityHref(program) }
                    : undefined
              }
            />
            <EntityBody entity={artifact} />
            <ExternalLinks entity={artifact} />
          </div>
          <MetadataPanel entity={artifact} extra={extras} />
        </div>
        <ResearchNavigation
          previous={adjacent.previous}
          next={adjacent.next}
          parent={project ?? program}
          descendants={stories}
        />
        <KnowledgeDiscovery entities={related} />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": schemaType,
            name: artifact.title,
            description: artifact.summary,
            dateCreated: artifact.createdAt,
            license: field(artifact, "license"),
            url:
              field(artifact, "sourceUrl") ??
              field(artifact, "repositoryUrl") ??
              field(artifact, "preprintUrl"),
          }),
        }}
      />
    </main>
  );
}
