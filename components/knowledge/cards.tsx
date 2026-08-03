import Link from "next/link";
import type { LaboratoryEntity } from "@/lib/presentation";
import { artifactLabel, entityHref, field, formatDate, readingMinutes } from "@/lib/presentation";
import { EntityMeta, Status, TagList } from "@/components/shared/primitives";

export function ProgramCard({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  return (
    <article className="entity-card program-card">
      <div className="card-top">
        <span>Research program</span>
        <Status value={entity.status} />
      </div>
      <h3>
        <Link href={entityHref(entity)}>{entity.title}</Link>
      </h3>
      <p>{entity.summary}</p>
      {field(entity, "theme") && <p className="card-note">{field(entity, "theme")}</p>}
      <TagList entity={entity} />
    </article>
  );
}

export function ProjectCard({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  return (
    <article className="entity-card project-card">
      <div className="card-top">
        <span>Research project</span>
        <Status value={entity.status} />
      </div>
      <h3>
        <Link href={entityHref(entity)}>{entity.title}</Link>
      </h3>
      <p>{entity.summary}</p>
      <p className="card-date">Opened {formatDate(entity.createdAt)}</p>
      <TagList entity={entity} />
    </article>
  );
}

export function StoryCard({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  return (
    <article className="story-card">
      <div>
        <p className="card-kicker">{field(entity, "noteType")?.replaceAll("-", " ") ?? "Story"}</p>
        <h3>
          <Link href={entityHref(entity)}>{entity.title}</Link>
        </h3>
        <p>{entity.summary}</p>
        <TagList entity={entity} />
      </div>
      <div className="story-card-meta">
        <time dateTime={entity.createdAt}>{formatDate(entity.createdAt)}</time>
        <span>{readingMinutes(entity)} min read</span>
      </div>
    </article>
  );
}

export function ArtifactCard({ entity }: Readonly<{ entity: LaboratoryEntity }>) {
  return (
    <article className="entity-card artifact-card">
      <div className="card-top">
        <span>{artifactLabel(entity.kind)}</span>
        <Status value={entity.status} />
      </div>
      <h3>
        <Link href={entityHref(entity)}>{entity.title}</Link>
      </h3>
      <p>{entity.summary}</p>
      <EntityMeta entity={entity} />
    </article>
  );
}

export function EntityGrid({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="entity-grid">{children}</div>;
}
