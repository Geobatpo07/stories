import Link from "next/link";
import type { Route } from "next";
import type { LaboratoryEntity } from "@/lib/presentation";
import { field, formatDate } from "@/lib/presentation";
import { MarkdownDocument } from "./reading";
import { InformationGrid, Status, TagList } from "@/components/shared/primitives";

export function DetailHeader({
  entity,
  label,
  parent,
}: Readonly<{ entity: LaboratoryEntity; label: string; parent?: { title: string; href: Route } }>) {
  return (
    <header className="detail-header">
      <p className="eyebrow">{label}</p>
      <h1>{entity.title}</h1>
      <p className="detail-summary">{entity.summary}</p>
      {parent && (
        <p>
          <Link href={parent.href}>Part of {parent.title}</Link>
        </p>
      )}
      <TagList entity={entity} />
    </header>
  );
}

export function MetadataPanel({
  entity,
  extra = [],
}: Readonly<{
  entity: LaboratoryEntity;
  extra?: readonly { label: string; value: React.ReactNode }[];
}>) {
  return (
    <aside className="metadata-panel" aria-labelledby="metadata-title">
      <h2 id="metadata-title">Research record</h2>
      <InformationGrid
        items={[
          { label: "Status", value: <Status value={entity.status} /> },
          {
            label: "Created",
            value: <time dateTime={entity.createdAt}>{formatDate(entity.createdAt)}</time>,
          },
          {
            label: "Updated",
            value: <time dateTime={entity.updatedAt}>{formatDate(entity.updatedAt)}</time>,
          },
          ...extra,
        ]}
      />
    </aside>
  );
}

export function ExternalLinks({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  const links = [
    ["Repository", field(entity, "repositoryUrl")],
    ["Source", field(entity, "sourceUrl")],
    ["Preprint", field(entity, "preprintUrl")],
    ["Slides", field(entity, "slidesUrl")],
    ["Video", field(entity, "videoUrl")],
    ["DOI", field(entity, "doi")],
  ] as const;
  const available = links.flatMap(([label, url]) => (url ? [[label, url] as const] : []));
  if (!available.length) return null;
  return (
    <div className="external-links">
      <h2>Access</h2>
      <ul className="related-list">
        {available.map(([label, url]) => (
          <li key={label}>
            <a href={url} rel="noreferrer" target="_blank">
              <span>{label}</span>
              <small>External ↗</small>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function EntityBody({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  return entity.content.trim() ? (
    <div className="detail-body">
      <MarkdownDocument content={entity.content} />
    </div>
  ) : null;
}
