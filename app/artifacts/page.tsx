import type { Metadata } from "next";
import { ArtifactCard, EntityGrid } from "@/components/knowledge/cards";
import { Breadcrumb, EmptyState } from "@/components/shared/primitives";
import { artifactLabel, getLaboratory } from "@/lib/presentation";
export const metadata: Metadata = {
  title: "Research Artifacts",
  description: "Publications, datasets, software, and presentations produced through research.",
  alternates: { canonical: "/artifacts" },
};
export default async function ArtifactsPage() {
  const lab = await getLaboratory();
  const groups = Object.groupBy(lab.artifacts, (item) => artifactLabel(item.kind));
  return (
    <main id="main-content" className="shell page">
      <Breadcrumb items={[{ label: "Artifacts" }]} />
      <header className="page-hero">
        <p className="eyebrow">Research record</p>
        <h1>Research artifacts</h1>
        <p>
          The tangible record of inquiry: formal publications, reusable data, working software, and
          presentations that carry research into the world.
        </p>
      </header>
      {lab.artifacts.length ? (
        Object.entries(groups).map(
          ([label, items]) =>
            items && (
              <section className="content-section" key={label}>
                <header className="section-heading">
                  <h2>{label}</h2>
                  <p>
                    {items.length} {items.length === 1 ? "artifact" : "artifacts"}
                  </p>
                </header>
                <EntityGrid>
                  {items.map((item) => (
                    <ArtifactCard key={item.id} entity={item} />
                  ))}
                </EntityGrid>
              </section>
            ),
        )
      ) : (
        <EmptyState>No research artifacts have been published.</EmptyState>
      )}
    </main>
  );
}
