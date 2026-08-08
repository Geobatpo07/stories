import { isValidElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { CopyCode, ZoomableFigure } from "./reading-controls";

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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
