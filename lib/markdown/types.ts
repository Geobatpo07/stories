/** A parsed, schema-validated content file. Generic over its frontmatter shape. */
export interface ContentFile<TFrontmatter> {
  readonly slug: string;
  readonly frontmatter: TFrontmatter;
  readonly content: string;
  readonly filePath: string;
}
