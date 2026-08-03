import Link from "next/link";
import type { Route } from "next";
import type { LaboratoryEntity } from "@/lib/presentation";
import { entityHref, formatDate, tagsOf } from "@/lib/presentation";

export interface Crumb {
  readonly label: string;
  readonly href?: Route;
}

export function Breadcrumb({ items }: Readonly<{ items: readonly Crumb[] }>) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const structured = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      item: item.href ? new URL(item.href, base).toString() : undefined,
    })),
  };
  return (
    <>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <ol>
          {items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              {item.href ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replaceAll("<", "\\u003c") }}
      />
    </>
  );
}

export function Eyebrow({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="eyebrow">{children}</p>;
}

export function Status({ value }: Readonly<{ value: string }>) {
  return <span className={`status status-${value}`}>{value}</span>;
}

export function TagList({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  const tags = tagsOf(entity);
  if (!tags.length) return null;
  return (
    <ul className="tag-list" aria-label="Tags">
      {tags.map((tag) => (
        <li key={tag}>
          <Link href={`/stories?tag=${encodeURIComponent(tag)}` as Route}>{tag}</Link>
        </li>
      ))}
    </ul>
  );
}

export function ContentSection({
  title,
  intro,
  children,
  id,
}: Readonly<{ title: string; intro?: string; children: React.ReactNode; id?: string }>) {
  return (
    <section className="content-section" id={id}>
      <header className="section-heading">
        <h2>{title}</h2>
        {intro && <p>{intro}</p>}
      </header>
      {children}
    </section>
  );
}

export function EmptyState({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="empty-state">{children}</p>;
}

export function InformationGrid({
  items,
}: Readonly<{ items: readonly { label: string; value: React.ReactNode }[] }>) {
  return (
    <dl className="information-grid">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatisticsPanel({
  items,
}: Readonly<{ items: readonly { label: string; value: string | number }[] }>) {
  return (
    <dl className="statistics-panel" aria-label="Laboratory statistics">
      {items.map((item) => (
        <div key={item.label}>
          <dd>{item.value}</dd>
          <dt>{item.label}</dt>
        </div>
      ))}
    </dl>
  );
}

export function EntityMeta({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  return (
    <div className="entity-meta">
      <time dateTime={entity.createdAt}>{formatDate(entity.createdAt)}</time>
      <span aria-hidden="true">·</span>
      <Status value={entity.status} />
    </div>
  );
}

export function RelatedContent({
  title = "Related research",
  entities,
}: Readonly<{ title?: string; entities: readonly LaboratoryEntity[] }>) {
  if (!entities.length)
    return (
      <ContentSection title={title}>
        <EmptyState>No related work has been published yet.</EmptyState>
      </ContentSection>
    );
  return (
    <ContentSection title={title}>
      <ul className="related-list">
        {entities.map((entity) => (
          <li key={entity.id}>
            <Link href={entityHref(entity)}>
              <span>{entity.title}</span>
              <small>{entity.kind === "question" ? "Project" : entity.kind}</small>
            </Link>
          </li>
        ))}
      </ul>
    </ContentSection>
  );
}
