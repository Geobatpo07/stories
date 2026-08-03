import { findBySlug, findRelated, loadDatasets, type DatasetEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Dataset. */
export class DatasetService {
  static listAll(): readonly DatasetEntity[] {
    return loadDatasets();
  }

  static findBySlug(slug: string): DatasetEntity | undefined {
    return findBySlug("dataset", slug) as DatasetEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`dataset:${slug}`);
  }
}
