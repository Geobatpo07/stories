import { findBySlug, findRelated, loadPrograms, type ProgramEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Research Program. */
export class ProgramService {
  static listAll(): readonly ProgramEntity[] {
    return loadPrograms();
  }

  static findBySlug(slug: string): ProgramEntity | undefined {
    return findBySlug("program", slug) as ProgramEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`program:${slug}`);
  }
}
