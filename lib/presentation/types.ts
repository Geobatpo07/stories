import type { KnowledgeEntity } from "@/kernel";
import type { KnowledgeSourceMetadata } from "@/runtime";

export type LaboratoryEntity = KnowledgeEntity;

export interface EntityCollection {
  readonly programs: readonly LaboratoryEntity[];
  readonly projects: readonly LaboratoryEntity[];
  readonly stories: readonly LaboratoryEntity[];
  readonly artifacts: readonly LaboratoryEntity[];
}

export interface LaboratorySnapshot extends EntityCollection {
  readonly all: readonly LaboratoryEntity[];
  readonly metadata: KnowledgeSourceMetadata;
  related(entity: LaboratoryEntity, kinds?: readonly string[]): readonly LaboratoryEntity[];
  parent(entity: LaboratoryEntity, kind: string): LaboratoryEntity | undefined;
  children(entity: LaboratoryEntity, kinds?: readonly string[]): readonly LaboratoryEntity[];
}

export interface StoryFilters {
  readonly program?: string;
  readonly project?: string;
  readonly year?: string;
  readonly tag?: string;
  readonly sort?: "newest" | "oldest" | "reading-time";
}

export interface ContentBlock {
  readonly type: "heading" | "paragraph" | "list" | "quote" | "code";
  readonly text?: string;
  readonly level?: number;
  readonly id?: string;
  readonly items?: readonly string[];
}

export interface SearchRecord {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly excerpt: string;
  readonly kind: "Program" | "Project" | "Story" | "Artifact";
  readonly subtype?: string;
  readonly tags: readonly string[];
  readonly date: string;
  readonly href: string;
}

export interface SearchResult extends SearchRecord {
  readonly score: number;
}

export interface TimelineEntry {
  readonly id: string;
  readonly title: string;
  readonly date: string;
  readonly kind: SearchRecord["kind"];
  readonly href: string;
  readonly summary: string;
}
