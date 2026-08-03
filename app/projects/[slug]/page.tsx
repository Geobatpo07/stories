import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArtifactCard, EntityGrid, StoryCard } from "@/components/knowledge/cards";
import { DetailHeader, EntityBody, MetadataPanel } from "@/components/knowledge/detail";
import { KnowledgeDiscovery, ResearchNavigation } from "@/components/knowledge/research-navigation";
import {
  Breadcrumb,
  ContentSection,
  EmptyState,
  RelatedContent,
  StatisticsPanel,
} from "@/components/shared/primitives";
import { adjacentEntities, entityHref, findEntity, getLaboratory } from "@/lib/presentation";
export async function generateStaticParams() {
  return (await getLaboratory()).projects.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = findEntity((await getLaboratory()).projects, slug);
  return item
    ? {
        title: item.title,
        description: item.summary,
        alternates: { canonical: `/projects/${slug}` },
        openGraph: { title: item.title, description: item.summary, type: "article" },
      }
    : {};
}
export default async function ProjectPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lab = await getLaboratory();
  const project = findEntity(lab.projects, slug);
  if (!project) notFound();
  const program = lab.parent(project, "program");
  const children = lab.children(project);
  const investigations = children.filter(
    (item) => item.kind === "hypothesis" || item.kind === "experiment",
  );
  const stories = lab.related(project, ["note"]);
  const artifacts = children.filter((item) =>
    lab.artifacts.some((artifact) => artifact.id === item.id),
  );
  const relatedProjects = lab.related(project, ["question"]);
  const adjacent = adjacentEntities(lab.projects, project);
  return (
    <main id="main-content">
      <div className="shell page">
        <Breadcrumb items={[{ label: "Projects", href: "/projects" }, { label: project.title }]} />
        <div className="detail-layout">
          <div>
            <DetailHeader
              entity={project}
              label="Research project"
              parent={program ? { title: program.title, href: entityHref(program) } : undefined}
            />
            <EntityBody entity={project} />
          </div>
          <MetadataPanel
            entity={project}
            extra={program ? [{ label: "Program", value: program.title }] : []}
          />
        </div>
        <ContentSection
          title="Investigation"
          intro="Hypotheses and experiments that make this question testable."
        >
          {investigations.length ? (
            <ul className="related-list">
              {investigations.map((item) => (
                <li key={item.id}>
                  <span>
                    <span>{item.title}</span>
                    <small>{item.kind}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No investigations are attached to this project.</EmptyState>
          )}
        </ContentSection>
        <ContentSection title="Stories">
          {stories.length ? (
            <div className="story-list">
              {stories.map((item) => (
                <StoryCard entity={item} key={item.id} />
              ))}
            </div>
          ) : (
            <EmptyState>No stories are directly attached to this project.</EmptyState>
          )}
        </ContentSection>
        <ContentSection title="Artifacts">
          {artifacts.length ? (
            <EntityGrid>
              {artifacts.map((item) => (
                <ArtifactCard entity={item} key={item.id} />
              ))}
            </EntityGrid>
          ) : (
            <EmptyState>No artifacts are directly attached to this project.</EmptyState>
          )}
        </ContentSection>
        <ContentSection title="Project record">
          <StatisticsPanel
            items={[
              { label: "Investigations", value: investigations.length },
              { label: "Stories", value: stories.length },
              { label: "Artifacts", value: artifacts.length },
              { label: "Relationships", value: project.relationships.length },
            ]}
          />
        </ContentSection>
        <ResearchNavigation
          previous={adjacent.previous}
          next={adjacent.next}
          parent={program}
          descendants={children}
        />
        {relatedProjects.length ? (
          <RelatedContent title="Related projects" entities={relatedProjects} />
        ) : (
          <KnowledgeDiscovery entities={lab.related(project)} />
        )}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ResearchProject",
            name: project.title,
            description: project.summary,
            isPartOf: program ? { "@type": "ResearchProject", name: program.title } : undefined,
          }),
        }}
      />
    </main>
  );
}
