import type { ContentFile } from "@/lib/markdown";
import type { PublicationFrontmatter } from "./schema";

export type { PublicationFrontmatter } from "./schema";

/** A Publication as read from `content/publications/*.mdx`. */
export type Publication = ContentFile<PublicationFrontmatter>;
