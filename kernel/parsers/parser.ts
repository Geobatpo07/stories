/** A source file discovered but not yet validated — frontmatter is raw, untyped data. */
export interface ParsedSource {
  readonly slug: string;
  readonly data: unknown;
  readonly content: string;
  readonly sourcePath: string;
}

/**
 * Source-type abstraction. `MarkdownParser` is the only implementation
 * this sprint; future sources (BibTeX, ORCID, HAL, OpenAlex, CrossRef,
 * GitHub, REST APIs) implement the same interface and plug into the same
 * registry without any other Kernel file changing.
 */
export interface Parser {
  /** List source paths under a collection directory. Pure discovery — no parsing, no validation. */
  discover(collectionDir: string): readonly string[];
  /** Read and split one source into raw, unvalidated frontmatter + body. */
  parse(sourcePath: string): ParsedSource;
}
