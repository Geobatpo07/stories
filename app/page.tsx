import Link from "next/link";
import type { Route } from "next";
import {
  ArtifactCard,
  EntityGrid,
  ProgramCard,
  ProjectCard,
  StoryCard,
} from "@/components/knowledge/cards";
import { ContentSection, EmptyState, StatisticsPanel } from "@/components/shared/primitives";
import { formatDate, getLaboratory } from "@/lib/presentation";

export default async function HomePage() {
  const lab = await getLaboratory();
  const recentStories = [...lab.stories]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);
  const recentArtifacts = [...lab.artifacts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const featuredProjects = [...lab.projects]
    .sort(
      (a, b) =>
        Number(b.status === "active") - Number(a.status === "active") ||
        b.createdAt.localeCompare(a.createdAt),
    )
    .slice(0, 2);
  const activity = [...lab.all].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5);
  return (
    <main id="main-content">
      <div className="shell home-hero">
        <div>
          <p className="eyebrow">Digital Research Laboratory</p>
          <h1>Ideas become evidence.</h1>
          <p className="intro">
            Geo&apos;s Stories is the public memory of a research practice—following questions as
            they become projects, narratives, experiments, and durable scientific artifacts.
          </p>
          <div className="hero-rule">Open notebook · evolving work</div>
        </div>
        <aside className="manifest-note" aria-label="Latest laboratory build">
          Latest laboratory record
          <strong>{formatDate(lab.metadata.generatedAt.slice(0, 10))}</strong>Platform v
          {lab.metadata.platformVersion}
          <br />
          Knowledge snapshot verified
        </aside>
      </div>
      <div className="shell">
        <ContentSection
          title="Research programs"
          intro="Long-running scientific directions that organize the laboratory’s questions and outputs."
        >
          {lab.programs.length ? (
            <EntityGrid>
              {lab.programs.map((item) => (
                <ProgramCard entity={item} key={item.id} />
              ))}
            </EntityGrid>
          ) : (
            <EmptyState>No research programs have been published.</EmptyState>
          )}
        </ContentSection>
        <ContentSection
          title="Featured projects"
          intro="Concrete questions currently guiding experiments and investigation."
        >
          {featuredProjects.length ? (
            <EntityGrid>
              {featuredProjects.map((item) => (
                <ProjectCard entity={item} key={item.id} />
              ))}
            </EntityGrid>
          ) : (
            <EmptyState>No active projects have been published.</EmptyState>
          )}
        </ContentSection>
        <ContentSection
          title="Recent stories"
          intro="Working notes and essays from inside the research process."
        >
          <div className="story-list">
            {recentStories.map((item) => (
              <StoryCard entity={item} key={item.id} />
            ))}
          </div>
          {!recentStories.length && <EmptyState>No stories have been published.</EmptyState>}
          <p>
            <Link href={"/stories" as Route}>Explore all stories →</Link>
          </p>
        </ContentSection>
        <ContentSection
          title="Research artifacts"
          intro="Tangible outputs: publications, datasets, software, and presentations."
        >
          {recentArtifacts.length ? (
            <EntityGrid>
              {recentArtifacts.map((item) => (
                <ArtifactCard entity={item} key={item.id} />
              ))}
            </EntityGrid>
          ) : (
            <EmptyState>No artifacts have been published.</EmptyState>
          )}
        </ContentSection>
        <ContentSection title="Laboratory at a glance">
          <StatisticsPanel
            items={[
              { label: "Programs", value: lab.programs.length },
              { label: "Projects", value: lab.projects.length },
              { label: "Stories", value: lab.stories.length },
              { label: "Artifacts", value: lab.artifacts.length },
            ]}
          />
        </ContentSection>
        <ContentSection title="Recent activity" intro="The latest additions across the laboratory.">
          <ol className="related-list">
            {activity.map((entity) => (
              <li key={entity.id}>
                <Link
                  href={
                    (entity.kind === "program"
                      ? `/programs/${entity.slug}`
                      : entity.kind === "question"
                        ? `/projects/${entity.slug}`
                        : entity.kind === "note"
                          ? `/stories/${entity.slug}`
                          : `/artifacts/${entity.kind}/${entity.slug}`) as Route
                  }
                >
                  <span>{entity.title}</span>
                  <small>{formatDate(entity.updatedAt)}</small>
                </Link>
              </li>
            ))}
          </ol>
        </ContentSection>
      </div>
    </main>
  );
}
