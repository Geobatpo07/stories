import type { ContentFile } from "@/lib/markdown";
import type { ExperimentFrontmatter } from "./schema";

export type { ExperimentFrontmatter } from "./schema";

/** An Experiment as read from `content/experiments/*.mdx`. */
export type Experiment = ContentFile<ExperimentFrontmatter>;
