import { findBySlug, findRelated, loadPresentations, type PresentationEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Presentation. */
export class PresentationService {
  static listAll(): readonly PresentationEntity[] {
    return loadPresentations();
  }

  static findBySlug(slug: string): PresentationEntity | undefined {
    return findBySlug("presentation", slug) as PresentationEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`presentation:${slug}`);
  }
}
