import { findBySlug, findRelated, loadHypotheses, type HypothesisEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Hypothesis. */
export class HypothesisService {
  static listAll(): readonly HypothesisEntity[] {
    return loadHypotheses();
  }

  static findBySlug(slug: string): HypothesisEntity | undefined {
    return findBySlug("hypothesis", slug) as HypothesisEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`hypothesis:${slug}`);
  }
}
