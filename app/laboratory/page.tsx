import type { Metadata } from "next";
import {
  ArtifactCard,
  EntityGrid,
  ProgramCard,
  ProjectCard,
  StoryCard,
} from "@/components/knowledge/cards";
import { ResearchTimeline } from "@/components/knowledge/timeline";
import {
  Breadcrumb,
  ContentSection,
  EmptyState,
  StatisticsPanel,
} from "@/components/shared/primitives";
import { createTimeline, formatDate, getLaboratory } from "@/lib/presentation";
export const metadata: Metadata = {
  title: "Laboratory Overview",
  description:
    "Programs, projects, stories, artifacts, and the evolving timeline of the Geo's Stories Research Laboratory.",
  alternates: { canonical: "/laboratory" },
};
export default async function LaboratoryPage() {
  const lab = await getLaboratory();
  const timeline = createTimeline(lab);
  const latest = timeline.slice(0, 6);
  return (
    <main id="main-content" className="shell page">
      <Breadcrumb items={[{ label: "Laboratory" }]} />
      <header className="page-hero">
        <p className="eyebrow">Laboratory overview</p>
        <h1>The research record</h1>
        <p>
          A single view of the questions being pursued, the stories being written, and the artifacts
          accumulating over time.
        </p>
        <div className="hero-rule">
          Snapshot generated {formatDate(lab.metadata.generatedAt.slice(0, 10))}
        </div>
      </header>
      <StatisticsPanel
        items={[
          { label: "Programs", value: lab.programs.length },
          { label: "Projects", value: lab.projects.length },
          { label: "Stories", value: lab.stories.length },
          { label: "Artifacts", value: lab.artifacts.length },
        ]}
      />
      <ContentSection
        title="Research timeline"
        intro="A chronological record of new directions, working notes, and research milestones."
      >
        <ResearchTimeline entries={timeline} />
      </ContentSection>
      <ContentSection title="Programs">
        {lab.programs.length ? (
          <EntityGrid>
            {lab.programs.map((item) => (
              <ProgramCard entity={item} key={item.id} />
            ))}
          </EntityGrid>
        ) : (
          <EmptyState>No programs have been published.</EmptyState>
        )}
      </ContentSection>
      <ContentSection title="Projects">
        {lab.projects.length ? (
          <EntityGrid>
            {lab.projects.map((item) => (
              <ProjectCard entity={item} key={item.id} />
            ))}
          </EntityGrid>
        ) : (
          <EmptyState>No projects have been published.</EmptyState>
        )}
      </ContentSection>
      <ContentSection title="Latest additions">
        <div className="story-list">
          {latest.map((entry) => (
            <article className="story-card" key={entry.id}>
              <div>
                <p className="card-kicker">{entry.kind}</p>
                <h3>
                  <a href={entry.href}>{entry.title}</a>
                </h3>
                <p>{entry.summary}</p>
              </div>
              <div className="story-card-meta">
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
              </div>
            </article>
          ))}
        </div>
      </ContentSection>
      <ContentSection title="Recent stories">
        {lab.stories.length ? (
          <div className="story-list">
            {lab.stories.slice(0, 3).map((item) => (
              <StoryCard entity={item} key={item.id} />
            ))}
          </div>
        ) : (
          <EmptyState>No stories have been published.</EmptyState>
        )}
      </ContentSection>
      <ContentSection title="Recent artifacts">
        {lab.artifacts.length ? (
          <EntityGrid>
            {lab.artifacts.slice(0, 4).map((item) => (
              <ArtifactCard entity={item} key={item.id} />
            ))}
          </EntityGrid>
        ) : (
          <EmptyState>No artifacts have been published.</EmptyState>
        )}
      </ContentSection>
    </main>
  );
}
