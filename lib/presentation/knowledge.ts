import type { EntityKind } from "@/kernel";
import type { Route } from "next";
import { getRuntimeContext } from "./runtime";
import type {
  ContentBlock,
  LaboratoryEntity,
  LaboratorySnapshot,
  SearchRecord,
  StoryFilters,
  TimelineEntry,
} from "./types";

export const ARTIFACT_KINDS = ["publication", "dataset", "software", "presentation"] as const;

let laboratoryPromise: Promise<LaboratorySnapshot> | undefined;

export function getLaboratory(): Promise<LaboratorySnapshot> {
  laboratoryPromise ??= loadLaboratory();
  return laboratoryPromise;
}

async function loadLaboratory(): Promise<LaboratorySnapshot> {
  const context = await getRuntimeContext();
  const all = context.kernel.entities as readonly LaboratoryEntity[];
  const metadata = context.metadata.source;
  if (!metadata) throw new Error("The Runtime did not provide generated artifact metadata.");
  const byKind = (kind: EntityKind) => all.filter((entity) => entity.kind === kind);
  const related = (entity: LaboratoryEntity, kinds?: readonly string[]) =>
    context.kernel.graph
      .getRelated(entity.id)
      .filter((item) => !kinds || kinds.includes(item.kind)) as readonly LaboratoryEntity[];
  const children = (entity: LaboratoryEntity, kinds?: readonly string[]) =>
    context.kernel.graph
      .getChildren(entity.id)
      .filter((item) => !kinds || kinds.includes(item.kind)) as readonly LaboratoryEntity[];
  const parent = (entity: LaboratoryEntity, kind: string) =>
    context.kernel.graph.getParents(entity.id).find((item) => item.kind === kind) as
      LaboratoryEntity | undefined;

  return {
    all,
    programs: byKind("program"),
    projects: byKind("question"),
    stories: byKind("note"),
    artifacts: all.filter((entity) =>
      ARTIFACT_KINDS.includes(entity.kind as (typeof ARTIFACT_KINDS)[number]),
    ),
    metadata,
    related,
    children,
    parent,
  };
}

export function findEntity(
  items: readonly LaboratoryEntity[],
  slug: string,
  kind?: string,
): LaboratoryEntity | undefined {
  return items.find((item) => item.slug === slug && (!kind || item.kind === kind));
}

export function tagsOf(entity: LaboratoryEntity): readonly string[] {
  return Array.isArray(entity.metadata.tags)
    ? entity.metadata.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
}

export function field(entity: LaboratoryEntity, key: string): string | undefined {
  const value =
    (entity as unknown as Readonly<Record<string, unknown>>)[key] ?? entity.metadata[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function readingMinutes(entity: LaboratoryEntity): number {
  const words = entity.content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

export function filterStories(
  stories: readonly LaboratoryEntity[],
  laboratory: LaboratorySnapshot,
  filters: StoryFilters,
): readonly LaboratoryEntity[] {
  const result = stories.filter((story) => {
    if (filters.year && !story.createdAt.startsWith(filters.year)) return false;
    if (filters.tag && !tagsOf(story).includes(filters.tag)) return false;
    if (filters.program && field(story, "programSlug") !== filters.program) return false;
    if (filters.project) {
      const project = findEntity(laboratory.projects, filters.project, "question");
      if (!project || !laboratory.related(story).some((item) => item.id === project.id))
        return false;
    }
    return true;
  });
  return [...result].sort((a, b) => {
    if (filters.sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
    if (filters.sort === "reading-time") return readingMinutes(b) - readingMinutes(a);
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export function parseContent(content: string): readonly ContentBlock[] {
  const lines = content.replace(/\r/g, "").split("\n");
  const blocks: ContentBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: string[] | undefined;
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    if (list.length) blocks.push({ type: "list", items: list });
    paragraph = [];
    list = [];
  };
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = undefined;
      } else {
        flush();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      const text = heading[2] ?? "";
      blocks.push({ type: "heading", level: heading[1]?.length ?? 2, text, id: slugify(text) });
    } else if (/^[-*]\s+/.test(line)) {
      if (paragraph.length) flush();
      list.push(line.replace(/^[-*]\s+/, ""));
    } else if (line.startsWith("> ")) {
      flush();
      blocks.push({ type: "quote", text: line.slice(2) });
    } else if (!line.trim()) {
      flush();
    } else {
      if (list.length) flush();
      paragraph.push(line.trim());
    }
  }
  flush();
  if (code) blocks.push({ type: "code", text: code.join("\n") });
  return blocks;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function entityHref(entity: LaboratoryEntity): Route {
  if (entity.kind === "program") return `/programs/${entity.slug}` as Route;
  if (entity.kind === "question") return `/projects/${entity.slug}` as Route;
  if (entity.kind === "note") return `/stories/${entity.slug}` as Route;
  return `/artifacts/${entity.kind}/${entity.slug}` as Route;
}

export function artifactLabel(kind: string): string {
  return (
    (
      {
        publication: "Publication",
        dataset: "Dataset",
        software: "Software",
        presentation: "Presentation",
      } as Record<string, string>
    )[kind] ?? kind
  );
}

export function publicKind(entity: LaboratoryEntity): SearchRecord["kind"] {
  if (entity.kind === "program") return "Program";
  if (entity.kind === "question") return "Project";
  if (entity.kind === "note") return "Story";
  return "Artifact";
}

export function createSearchRecords(laboratory: LaboratorySnapshot): readonly SearchRecord[] {
  return [
    ...laboratory.programs,
    ...laboratory.projects,
    ...laboratory.stories,
    ...laboratory.artifacts,
  ]
    .map((entity) => ({
      id: entity.id,
      title: entity.title,
      summary: entity.summary,
      excerpt: entity.content
        .replace(/[#*_`>$\[\]()]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 360),
      kind: publicKind(entity),
      subtype:
        entity.kind === "note"
          ? field(entity, "noteType")
          : entity.kind === "question"
            ? undefined
            : artifactLabel(entity.kind),
      tags: tagsOf(entity),
      date: entity.createdAt,
      href: entityHref(entity),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function createTimeline(laboratory: LaboratorySnapshot): readonly TimelineEntry[] {
  return createSearchRecords(laboratory)
    .map(({ id, title, date, kind, href, summary }) => ({ id, title, date, kind, href, summary }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function adjacentEntities(items: readonly LaboratoryEntity[], entity: LaboratoryEntity) {
  const ordered = [...items].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title),
  );
  const index = ordered.findIndex((item) => item.id === entity.id);
  return {
    previous: index > 0 ? ordered[index - 1] : undefined,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : undefined,
  };
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}
