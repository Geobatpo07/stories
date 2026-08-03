import type { ContentFile } from "@/lib/markdown";
import type { QuestionFrontmatter } from "./schema";

export type { QuestionFrontmatter } from "./schema";

/** A Scientific Question as read from `content/questions/*.mdx`. */
export type ScientificQuestion = ContentFile<QuestionFrontmatter>;
