import type { ContentFile } from "@/lib/markdown";
import type { PresentationFrontmatter } from "./schema";

export type { PresentationFrontmatter } from "./schema";
export type { PresentationEntity } from "@/kernel";

/** A Presentation as read from `content/presentations/*.mdx`. */
export type Presentation = ContentFile<PresentationFrontmatter>;
