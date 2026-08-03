import { findBySlug, findRelated, loadExperiments, type ExperimentEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Experiment. */
export class ExperimentService {
  static listAll(): readonly ExperimentEntity[] {
    return loadExperiments();
  }

  static findBySlug(slug: string): ExperimentEntity | undefined {
    return findBySlug("experiment", slug) as ExperimentEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`experiment:${slug}`);
  }
}
