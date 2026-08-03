import type { ParsedSource, Parser } from "../parsers/parser";

/** Loading + Parsing stage: read one source file into raw, unvalidated frontmatter + body. */
export function parseSource(sourcePath: string, parser: Parser): ParsedSource {
  return parser.parse(sourcePath);
}
