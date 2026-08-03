import type { ContentFile } from "@/lib/markdown";
import type { KnowledgeFrontmatter } from "./schema";

export type { KnowledgeFrontmatter, KnowledgeObjectType } from "./schema";

/** A Knowledge Object as read from `content/notes/*.mdx`. */
export type KnowledgeObject = ContentFile<KnowledgeFrontmatter>;
