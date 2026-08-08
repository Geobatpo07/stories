import Link from "next/link";
import type { Route } from "next";
import type { LaboratoryEntity } from "@/lib/presentation";
import { formatDate, parseContent, readingMinutes } from "@/lib/presentation";
import { Breadcrumb, TagList } from "@/components/shared/primitives";
import { ReadingProgress } from "./reading-controls";
export { MarkdownDocument } from "./markdown-document";

export function ReadingHeader({
  story,
  program,
  project,
}: Readonly<{ story: LaboratoryEntity; program?: LaboratoryEntity; project?: LaboratoryEntity }>) {
  return (
    <>
      <ReadingProgress />
      <header className="reading-header">
        <Breadcrumb
          items={[{ label: "Stories", href: "/stories" as Route }, { label: story.title }]}
        />
        <p className="eyebrow">Research story</p>
        <h1>{story.title}</h1>
        <p className="reading-deck">{story.summary}</p>
        <div className="reading-byline">
          <span>
            {program ? (
              <>
                Research lead{" "}
                <strong>
                  {String(
                    (program as unknown as Record<string, unknown>).leadResearcher ??
                      program.metadata.leadResearcher ??
                      "",
                  )}
                </strong>
              </>
            ) : (
              "Stories Laboratory"
            )}
          </span>
          <time dateTime={story.createdAt}>{formatDate(story.createdAt)}</time>
          <span>{readingMinutes(story)} min read</span>
        </div>
        {(program || project) && (
          <div className="reading-context">
            {program && <Link href={`/programs/${program.slug}` as Route}>{program.title}</Link>}
            {project && <Link href={`/projects/${project.slug}` as Route}>{project.title}</Link>}
          </div>
        )}
        <TagList entity={story} />
      </header>
    </>
  );
}

export function TableOfContents({ content }: Readonly<{ content: string }>) {
  const headings = parseContent(content).filter((block) => block.type === "heading");
  if (!headings.length) return null;
  const list = (
    <ol>
      {headings.map((heading) => (
        <li key={heading.id}>
          <a href={`#${heading.id}`}>{heading.text}</a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav className="toc" aria-labelledby="toc-title">
        <p id="toc-title">In this story</p>
        {list}
      </nav>
      <details className="toc-mobile">
        <summary>In this story</summary>
        {list}
      </details>
    </>
  );
}

export function StoryNavigation({
  previous,
  next,
}: Readonly<{ previous?: LaboratoryEntity; next?: LaboratoryEntity }>) {
  if (!previous && !next) return null;
  return (
    <nav className="story-navigation" aria-label="Story navigation">
      {previous ? (
        <Link href={`/stories/${previous.slug}` as Route}>
          <small>Previous story</small>
          <span>{previous.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link href={`/stories/${next.slug}` as Route}>
          <small>Next story</small>
          <span>{next.title}</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
