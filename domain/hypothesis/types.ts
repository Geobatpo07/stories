import type { ContentFile } from "@/lib/markdown";
import type { HypothesisFrontmatter } from "./schema";

export type { HypothesisFrontmatter } from "./schema";

/**
 * A Hypothesis, once it has a content source to be read from (see
 * README.md — currently no `content/hypotheses/` collection exists).
 */
export type Hypothesis = ContentFile<HypothesisFrontmatter>;
