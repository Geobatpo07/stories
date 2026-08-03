import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReadingHeader, MarkdownDocument, TableOfContents } from "@/components/knowledge/reading";
import { KnowledgeDiscovery, ResearchNavigation } from "@/components/knowledge/research-navigation";
import { EmptyState } from "@/components/shared/primitives";
import {
  adjacentEntities,
  field,
  findEntity,
  getLaboratory,
  parseContent,
} from "@/lib/presentation";
export async function generateStaticParams() {
  return (await getLaboratory()).stories.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const item = findEntity((await getLaboratory()).stories, slug);
  return item
    ? {
        title: item.title,
        description: item.summary,
        alternates: { canonical: `/stories/${slug}` },
        openGraph: {
          title: item.title,
          description: item.summary,
          type: "article",
          publishedTime: item.createdAt,
          tags: Array.isArray(item.metadata.tags) ? (item.metadata.tags as string[]) : [],
        },
        twitter: { card: "summary_large_image", title: item.title, description: item.summary },
      }
    : {};
}
export default async function StoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lab = await getLaboratory();
  const story = findEntity(lab.stories, slug);
  if (!story) notFound();
  const programSlug = field(story, "programSlug");
  const program = programSlug
    ? findEntity(lab.programs, programSlug)
    : lab.parent(story, "program");
  const project = lab.parent(story, "question");
  const adjacent = adjacentEntities(lab.stories, story);
  const related = lab
    .related(story)
    .filter((item) => item.id !== program?.id && item.id !== project?.id);
  const artifacts = related.filter((item) =>
    lab.artifacts.some((artifact) => artifact.id === item.id),
  );
  const relatedStories = related.filter((item) => item.kind === "note");
  const hasReferences = parseContent(story.content).some(
    (block) => block.type === "heading" && /references|footnotes/i.test(block.text ?? ""),
  );
  return (
    <main id="main-content">
      <ReadingHeader story={story} program={program} project={project} />
      <div className="reading-layout">
        <TableOfContents content={story.content} />
        <article>
          <MarkdownDocument content={story.content} />
          {!hasReferences && (
            <section aria-labelledby="references-title">
              <h2 id="references-title" className="sr-only">
                References and footnotes
              </h2>
              <EmptyState>No references or footnotes are recorded for this story.</EmptyState>
            </section>
          )}
        </article>
        <aside className="reading-aside">
          <p>
            <strong>Research context</strong>
          </p>
          <p>{program?.title ?? "Independent inquiry"}</p>
          <p>
            {story.status} record
            <br />
            Last updated {story.updatedAt}
          </p>
        </aside>
      </div>
      <div className="shell">
        <ResearchNavigation
          previous={adjacent.previous}
          next={adjacent.next}
          parent={project ?? program}
          descendants={lab.children(story)}
        />
        <KnowledgeDiscovery
          entities={[
            ...relatedStories,
            ...artifacts,
            ...related.filter((item) => item.kind === "program" || item.kind === "question"),
          ]}
        />
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ScholarlyArticle",
            headline: story.title,
            description: story.summary,
            datePublished: story.createdAt,
            dateModified: story.updatedAt,
            author: program
              ? { "@type": "Person", name: field(program, "leadResearcher") }
              : { "@type": "Organization", name: "Stories Research Laboratory" },
            isPartOf: program ? { "@type": "ResearchProject", name: program.title } : undefined,
          }),
        }}
      />
    </main>
  );
}
