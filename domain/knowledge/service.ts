import {
  findBySlug,
  findRelated,
  loadKnowledgeObjects,
  loadResearchNotes,
  loadTutorials,
  type KnowledgeObjectEntity,
} from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Knowledge Object. */
export class KnowledgeService {
  static listAll(): readonly KnowledgeObjectEntity[] {
    return loadKnowledgeObjects();
  }

  static listResearchNotes(): readonly KnowledgeObjectEntity[] {
    return loadResearchNotes();
  }

  static listTutorials(): readonly KnowledgeObjectEntity[] {
    return loadTutorials();
  }

  static findBySlug(slug: string): KnowledgeObjectEntity | undefined {
    return findBySlug("note", slug) as KnowledgeObjectEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`note:${slug}`);
  }
}
