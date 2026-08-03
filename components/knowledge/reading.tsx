import { isValidElement, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { LaboratoryEntity } from "@/lib/presentation";
import { formatDate, parseContent, readingMinutes, slugify } from "@/lib/presentation";
import { Breadcrumb, TagList } from "@/components/shared/primitives";
import { CopyCode, ReadingProgress, ZoomableFigure } from "./reading-controls";

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

const markdownComponents: Components = {
  h2: ({ children }) => <h2 id={slugify(textOf(children))}>{children}</h2>,
  h3: ({ children }) => <h3 id={slugify(textOf(children))}>{children}</h3>,
  h4: ({ children }) => <h4 id={slugify(textOf(children))}>{children}</h4>,
  a: ({ href, children }) => (
    <a
      href={href}
      rel={href?.startsWith("http") ? "noreferrer" : undefined}
      target={href?.startsWith("http") ? "_blank" : undefined}
    >
      {children}
      {href?.startsWith("http") && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  ),
  table: ({ children }) => (
    <div className="table-scroll" role="region" aria-label="Scrollable research table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
  blockquote: ({ children }) => (
    <blockquote className={textOf(children).includes("[!CITE]") ? "citation-block" : undefined}>
      {children}
    </blockquote>
  ),
  p: ({ children }) =>
    isValidElement(children) && children.type === ZoomableFigure ? children : <p>{children}</p>,
  pre: ({ children }) => {
    const child = isValidElement<{ className?: string; children?: ReactNode }>(children)
      ? children
      : undefined;
    if (child?.props.className?.includes("math-display"))
      return <pre className="math-block">{children}</pre>;
    const language = /language-([^ ]+)/.exec(child?.props.className ?? "")?.[1];
    return <CopyCode code={textOf(child?.props.children).replace(/\n$/, "")} language={language} />;
  },
  img: ({ src, alt, title }) =>
    typeof src === "string" ? (
      <ZoomableFigure src={src} alt={alt ?? "Research figure"} caption={title ?? undefined} />
    ) : null,
};

export function MarkdownDocument({ content }: Readonly<{ content: string }>) {
  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function textOf(value: ReactNode): string {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(value)) return textOf(value.props.children);
  return "";
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
