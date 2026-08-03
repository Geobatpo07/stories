import type { ContentFile } from "@/lib/markdown";
import type { SoftwareFrontmatter } from "./schema";

export type { SoftwareFrontmatter } from "./schema";

/** A Software entity as read from `content/software/*.mdx`. */
export type Software = ContentFile<SoftwareFrontmatter>;
