import { findBySlug, findRelated, loadPublications, type PublicationEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Publication. */
export class PublicationService {
  static listAll(): readonly PublicationEntity[] {
    return loadPublications();
  }

  static findBySlug(slug: string): PublicationEntity | undefined {
    return findBySlug("publication", slug) as PublicationEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`publication:${slug}`);
  }
}
