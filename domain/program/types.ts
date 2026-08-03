import type { ContentFile } from "@/lib/markdown";
import type { ProgramFrontmatter } from "./schema";

export type { ProgramFrontmatter } from "./schema";

/** A Research Program as read from `content/programs/*.mdx`. */
export type ResearchProgram = ContentFile<ProgramFrontmatter>;
