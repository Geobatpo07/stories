import type { Metadata } from "next";
import { EntityGrid, ProjectCard } from "@/components/knowledge/cards";
import { Breadcrumb, EmptyState } from "@/components/shared/primitives";
import { getLaboratory } from "@/lib/presentation";
export const metadata: Metadata = {
  title: "Research Projects",
  description: "Concrete research questions under active investigation.",
  alternates: { canonical: "/projects" },
};
export default async function ProjectsPage() {
  const lab = await getLaboratory();
  return (
    <main id="main-content" className="shell page">
      <Breadcrumb items={[{ label: "Projects" }]} />
      <header className="page-hero">
        <p className="eyebrow">Active inquiry</p>
        <h1>Research projects</h1>
        <p>
          Focused questions that turn broad programs into testable work. Follow each project through
          its hypotheses, experiments, notes, and outputs.
        </p>
      </header>
      {lab.projects.length ? (
        <EntityGrid>
          {lab.projects.map((item) => (
            <ProjectCard key={item.id} entity={item} />
          ))}
        </EntityGrid>
      ) : (
        <EmptyState>No research projects have been published.</EmptyState>
      )}
    </main>
  );
}
