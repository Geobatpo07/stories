import type { ContentFile } from "@/lib/markdown";
import type { HypothesisFrontmatter } from "./schema";

export type { HypothesisFrontmatter } from "./schema";
export type { HypothesisEntity } from "@/kernel";

/** A Hypothesis as read from `content/hypotheses/*.mdx`. */
export type Hypothesis = ContentFile<HypothesisFrontmatter>;
