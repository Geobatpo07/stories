import { findBySlug, findRelated, loadQuestions, type QuestionEntity } from "@/kernel";

/** Thin wrapper over the Knowledge Kernel's public API, scoped to Scientific Question. */
export class QuestionService {
  static listAll(): readonly QuestionEntity[] {
    return loadQuestions();
  }

  static findBySlug(slug: string): QuestionEntity | undefined {
    return findBySlug("question", slug) as QuestionEntity | undefined;
  }

  static findRelated(slug: string) {
    return findRelated(`question:${slug}`);
  }
}
