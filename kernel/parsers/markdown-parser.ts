import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { extractSlug, listContentFiles } from "@/lib/markdown";
import { KnowledgeParseError } from "../errors";
import type { ParsedSource, Parser } from "./parser";

/**
 * Reads Markdown/MDX content files. Reuses `lib/markdown`'s pure
 * filesystem listing and slug-fallback logic (no need to duplicate them),
 * but does NOT reuse `readContentFile` — that helper fuses parsing and
 * Zod validation into one call, which would collapse the Kernel's
 * Parsing and Validation stages and make a `ZodError` indistinguishable
 * from a genuine file-read failure. `parse()` here calls `gray-matter`
 * directly and returns unvalidated data; validation happens one stage
 * later in `kernel/pipeline/validation.ts`.
 */
export class MarkdownParser implements Parser {
  discover(collectionDir: string): readonly string[] {
    try {
      return listContentFiles(collectionDir);
    } catch (cause) {
      throw new KnowledgeParseError(collectionDir, cause);
    }
  }

  parse(sourcePath: string): ParsedSource {
    try {
      const raw = readFileSync(sourcePath, "utf-8");
      const { data, content } = matter(raw);
      const slug = extractSlug(data, sourcePath);
      return { slug, data, content: content.trim(), sourcePath };
    } catch (cause) {
      throw new KnowledgeParseError(sourcePath, cause);
    }
  }
}
