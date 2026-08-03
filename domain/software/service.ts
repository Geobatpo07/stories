import { findBySlug, findRelated, loadSoftware, type SoftwareEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Software. */
export class SoftwareService {
  static listAll(): readonly SoftwareEntity[] {
    return loadSoftware();
  }

  static findBySlug(slug: string): SoftwareEntity | undefined {
    return findBySlug("software", slug) as SoftwareEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`software:${slug}`);
  }
}
