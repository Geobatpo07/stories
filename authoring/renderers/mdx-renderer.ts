import { getAuthoringDefinition, validateAuthoringFields } from "@/kernel";
import type { AuthoringDocument, KnowledgeRenderer, RenderedKnowledgeDocument } from "../types";

export class MDXRenderer implements KnowledgeRenderer {
  readonly format = "mdx";

  async render(document: AuthoringDocument): Promise<RenderedKnowledgeDocument> {
    const validation = validateAuthoringFields(document.kind, document.fields);
    if (!validation.success || !validation.data) {
      throw new Error(
        validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
      );
    }
    const definition = getAuthoringDefinition(document.kind);
    const orderedNames = definition.fields.map((field) => field.name);
    const remainingNames = Object.keys(validation.data)
      .filter((name) => !orderedNames.includes(name))
      .sort();
    const names = [...orderedNames, ...remainingNames];
    const frontmatter = names
      .filter((name) => validation.data?.[name] !== undefined)
      .map((name) => `${name}: ${yamlValue(validation.data?.[name])}`)
      .join("\n");
    const body = normalizeBody(document.content);
    return {
      format: this.format,
      relativePath: `${definition.contentDir}/${String(validation.data.slug)}.mdx`,
      content: `---\n${frontmatter}\n---\n\n${body}`,
    };
  }
}

function normalizeBody(content: string): string {
  const normalized = content.replace(/\r\n?/g, "\n").trim();
  return normalized ? `${normalized}\n` : "";
}

function yamlValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => yamlValue(item)).join(", ")}]`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
}
