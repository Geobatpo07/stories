import type { Metadata } from "next";
import { EntityGrid, ProgramCard } from "@/components/knowledge/cards";
import { Breadcrumb, EmptyState } from "@/components/shared/primitives";
import { getLaboratory } from "@/lib/presentation";
export const metadata: Metadata = {
  title: "Research Programs",
  description: "The major scientific directions pursued by the Stories Research Laboratory.",
  alternates: { canonical: "/programs" },
};
export default async function ProgramsPage() {
  const lab = await getLaboratory();
  return (
    <main id="main-content" className="shell page">
      <Breadcrumb items={[{ label: "Programs" }]} />
      <header className="page-hero">
        <p className="eyebrow">Research directory</p>
        <h1>Research programs</h1>
        <p>
          Major scientific directions—each gathering questions, investigations, stories, and
          material outcomes into a coherent body of work.
        </p>
      </header>
      {lab.programs.length ? (
        <EntityGrid>
          {lab.programs.map((item) => (
            <ProgramCard key={item.id} entity={item} />
          ))}
        </EntityGrid>
      ) : (
        <EmptyState>No research programs have been published.</EmptyState>
      )}
    </main>
  );
}
