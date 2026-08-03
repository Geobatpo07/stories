import type { ContentStatus, ContentType, IsoDate, Slug } from "@/schemas";
import type { DatasetFrontmatter } from "@/domain/dataset/schema";
import type { ExperimentFrontmatter } from "@/domain/experiment/schema";
import type { HypothesisFrontmatter } from "@/domain/hypothesis/schema";
import type { KnowledgeFrontmatter } from "@/domain/knowledge/schema";
import type { PresentationFrontmatter } from "@/domain/presentation/schema";
import type { ProgramFrontmatter } from "@/domain/program/schema";
import type { PublicationFrontmatter } from "@/domain/publication/schema";
import type { QuestionFrontmatter } from "@/domain/question/schema";
import type { SoftwareFrontmatter } from "@/domain/software/schema";

/**
 * The Kernel's entity-kind vocabulary is the same `ContentType` enum the
 * schemas already define — reused, not reinvented, so the registry
 * (`kernel/registry`) and the schema vocabulary can never drift apart.
 */
export type EntityKind = ContentType;

/**
 * The shape every entity leaving the Kernel has, regardless of source or
 * kind. Nothing outside the Kernel ever sees a raw `ContentFile`, raw
 * frontmatter, or raw parsed JSON — only this.
 */
export interface KnowledgeEntity {
  /** Globally unique across every collection: `${kind}:${slug}`. */
  readonly id: string;
  readonly kind: EntityKind;
  /** Unique within `kind` only — the slug used in the source content file. */
  readonly slug: Slug;
  readonly title: string;
  readonly summary: string;
  readonly status: ContentStatus;
  /**
   * Both sourced from frontmatter's single `date` field today — Sprint 1's
   * frontmatter has no separate "last updated" field. Documented
   * simplification: split these once a content type actually needs to
   * track authored-vs-updated dates independently; not invented here.
   */
  readonly createdAt: IsoDate;
  readonly updatedAt: IsoDate;
  /** `tags` plus any validated frontmatter field not promoted to a named field on a per-kind entity. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** This entity's own `*Slug`/`*Slugs` fields, resolved. Populated by Relationship Resolution — empty until then. */
  readonly relationships: readonly Relationship[];
  /** Raw MDX body. Rendering it to React is an adapter's job, not the Kernel's. */
  readonly content: string;
  readonly filePath: string;
}

export type ProgramEntity = KnowledgeEntity &
  Pick<ProgramFrontmatter, "theme" | "leadResearcher" | "relatedQuestionSlugs">;

export type QuestionEntity = KnowledgeEntity & Pick<QuestionFrontmatter, "programSlug">;

export type HypothesisEntity = KnowledgeEntity & Pick<HypothesisFrontmatter, "questionSlug">;

export type ExperimentEntity = KnowledgeEntity &
  Pick<ExperimentFrontmatter, "questionSlug" | "hypothesisSlug">;

/** Covers Research Note, Dev Log, Reading Note, Tutorial, Conference Note, Book Review, Essay — see domain/knowledge/README.md. */
export type KnowledgeObjectEntity = KnowledgeEntity &
  Pick<KnowledgeFrontmatter, "noteType" | "programSlug">;

export type SoftwareEntity = KnowledgeEntity &
  Pick<SoftwareFrontmatter, "repositoryUrl" | "license">;

export type PublicationEntity = KnowledgeEntity &
  Pick<PublicationFrontmatter, "venue" | "doi" | "preprintUrl" | "coAuthors">;

export type DatasetEntity = KnowledgeEntity & Pick<DatasetFrontmatter, "sourceUrl" | "license">;

export type PresentationEntity = KnowledgeEntity &
  Pick<
    PresentationFrontmatter,
    "venue" | "slidesUrl" | "videoUrl" | "programSlug" | "questionSlug"
  >;

/** A lightweight, displayable pointer to another entity — not the full entity (see kernel/README.md). */
export interface ResolvedRef {
  readonly id: string;
  readonly kind: EntityKind;
  readonly slug: Slug;
  readonly title: string;
}

export interface Relationship {
  /** The frontmatter field this relationship came from, e.g. "programSlug". */
  readonly field: string;
  readonly cardinality: "one" | "many";
  readonly target: ResolvedRef;
}

export interface KnowledgeGraphEdge {
  readonly from: string;
  readonly to: string;
  readonly field: string;
}

export interface KnowledgeGraphNode {
  readonly entity: KnowledgeEntity;
  readonly outgoing: readonly KnowledgeGraphEdge[];
  readonly incoming: readonly KnowledgeGraphEdge[];
}

export interface KnowledgeGraph {
  readonly nodes: ReadonlyMap<string, KnowledgeGraphNode>;
  getNode(id: string): KnowledgeGraphNode | undefined;
  /** Entities this node points to (its outgoing edges' targets). */
  getParents(id: string): readonly KnowledgeEntity[];
  /** Entities that point to this node (its incoming edges' sources). */
  getChildren(id: string): readonly KnowledgeEntity[];
  /** Parents ∪ children, no duplicates. */
  getRelated(id: string): readonly KnowledgeEntity[];
}
