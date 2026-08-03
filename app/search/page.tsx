import type { Metadata } from "next";
import { SearchDirectory } from "@/components/search/search-experience";
import { Breadcrumb } from "@/components/shared/primitives";
import { createSearchRecords, getLaboratory } from "@/lib/presentation";
export const metadata: Metadata = {
  title: "Search",
  description: "Search research programs, projects, stories, and artifacts.",
  robots: { index: false, follow: true },
};
export default async function SearchPage() {
  const records = createSearchRecords(await getLaboratory());
  return (
    <main id="main-content" className="shell page">
      <Breadcrumb items={[{ label: "Search" }]} />
      <header className="page-hero compact-hero">
        <p className="eyebrow">Knowledge discovery</p>
        <h1>Search the laboratory</h1>
        <p>
          Find a research direction, trace a project, return to a story, or locate a scientific
          artifact.
        </p>
      </header>
      <SearchDirectory records={records} />
    </main>
  );
}
