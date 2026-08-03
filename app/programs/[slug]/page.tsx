import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArtifactCard, EntityGrid, ProjectCard, StoryCard } from "@/components/knowledge/cards";
import { DetailHeader, EntityBody, MetadataPanel } from "@/components/knowledge/detail";
import { KnowledgeDiscovery, ResearchNavigation } from "@/components/knowledge/research-navigation";
import {
  Breadcrumb,
  ContentSection,
  EmptyState,
  RelatedContent,
  StatisticsPanel,
} from "@/components/shared/primitives";
import { adjacentEntities, field, findEntity, getLaboratory } from "@/lib/presentation";

export async function generateStaticParams() {
  return (await getLaboratory()).programs.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = findEntity((await getLaboratory()).programs, slug);
  return item
    ? {
        title: item.title,
        description: item.summary,
        alternates: { canonical: `/programs/${slug}` },
        openGraph: { title: item.title, description: item.summary, type: "article" },
      }
    : {};
}

export default async function ProgramPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lab = await getLaboratory();
  const program = findEntity(lab.programs, slug);
  if (!program) notFound();
  const children = lab.children(program);
  const projects = children.filter((item) => item.kind === "question");
  const stories = children.filter((item) => item.kind === "note");
  const artifacts = children.filter((item) =>
    lab.artifacts.some((artifact) => artifact.id === item.id),
  );
  const relatedPrograms = lab.related(program, ["program"]);
  const adjacent = adjacentEntities(lab.programs, program);
  return (
    <main id="main-content">
      <div className="shell page">
        <Breadcrumb items={[{ label: "Programs", href: "/programs" }, { label: program.title }]} />
        <div className="detail-layout">
          <div>
            <DetailHeader entity={program} label="Research program" />
            <EntityBody entity={program} />
          </div>
          <MetadataPanel
            entity={program}
            extra={[
              {
                label: "Research lead",
                value: field(program, "leadResearcher") ?? "Not specified",
              },
              { label: "Theme", value: field(program, "theme") ?? "Open inquiry" },
            ]}
          />
        </div>
        <ContentSection title="Projects" intro="Focused questions pursued within this program.">
          {projects.length ? (
            <EntityGrid>
              {projects.map((item) => (
                <ProjectCard entity={item} key={item.id} />
              ))}
            </EntityGrid>
          ) : (
            <EmptyState>No projects are attached to this program.</EmptyState>
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
            <EmptyState>No stories are attached to this program.</EmptyState>
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
            <EmptyState>No artifacts are attached to this program.</EmptyState>
          )}
        </ContentSection>
        <ContentSection title="Research statistics">
          <StatisticsPanel
            items={[
              { label: "Projects", value: projects.length },
              { label: "Stories", value: stories.length },
              { label: "Artifacts", value: artifacts.length },
              { label: "Relationships", value: program.relationships.length },
            ]}
          />
        </ContentSection>
        <ResearchNavigation
          previous={adjacent.previous}
          next={adjacent.next}
          descendants={children.filter((item) =>
            ["question", "note", "publication", "dataset", "software", "presentation"].includes(
              item.kind,
            ),
          )}
        />
        {relatedPrograms.length ? (
          <RelatedContent title="Related programs" entities={relatedPrograms} />
        ) : (
          <KnowledgeDiscovery entities={lab.related(program)} />
        )}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ResearchProject",
            name: program.title,
            description: program.summary,
            dateCreated: program.createdAt,
          }),
        }}
      />
    </main>
  );
}
