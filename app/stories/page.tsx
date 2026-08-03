import type { Metadata } from "next";
import { StoryDirectory } from "@/components/search/story-directory";
import { Breadcrumb } from "@/components/shared/primitives";
import { field, formatDate, getLaboratory, readingMinutes, tagsOf } from "@/lib/presentation";
export const metadata: Metadata = {
  title: "Research Stories",
  description: "Notes and essays documenting research as it develops.",
  alternates: { canonical: "/stories" },
};
export default async function StoriesPage() {
  const lab = await getLaboratory();
  const stories = lab.stories.map((story) => ({
    id: story.id,
    slug: story.slug,
    title: story.title,
    summary: story.summary,
    date: story.createdAt,
    dateLabel: formatDate(story.createdAt),
    tags: tagsOf(story),
    noteType: field(story, "noteType") ?? "Story",
    minutes: readingMinutes(story),
    programSlug: field(story, "programSlug"),
    projectSlugs: lab.related(story, ["question"]).map((project) => project.slug),
  }));
  return (
    <main id="main-content" className="shell page">
      <Breadcrumb items={[{ label: "Stories" }]} />
      <header className="page-hero">
        <p className="eyebrow">Laboratory notebook</p>
        <h1>Research stories</h1>
        <p>
          Notes from the path between an open question and a durable result. Read chronologically or
          follow a program, project, year, or recurring idea.
        </p>
      </header>
      <StoryDirectory
        stories={stories}
        programs={lab.programs.map((item) => ({ value: item.slug, label: item.title }))}
        projects={lab.projects.map((item) => ({ value: item.slug, label: item.title }))}
      />
    </main>
  );
}
