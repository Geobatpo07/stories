import type { ContentFile } from "@/lib/markdown";
import type { DatasetFrontmatter } from "./schema";

export type { DatasetFrontmatter } from "./schema";

/** A Dataset entity as read from `content/datasets/*.mdx`. */
export type Dataset = ContentFile<DatasetFrontmatter>;
