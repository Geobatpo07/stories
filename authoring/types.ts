import { z } from "zod";
import { contentTypeSchema } from "@/schemas";
import type { EntityKind, FriendlyValidationIssue } from "@/kernel";

export const publicationStateSchema = z.enum(["draft", "published"]);

export const authoringDocumentSchema = z.object({
  version: z.literal(1),
  id: z.string().uuid(),
  kind: contentTypeSchema,
  publicationState: publicationStateSchema,
  fields: z.record(z.unknown()),
  content: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  publication: z
    .object({
      kind: contentTypeSchema,
      slug: z.string().min(1),
      path: z.string().min(1),
      publishedAt: z.string().datetime(),
    })
    .optional(),
});

export type AuthoringDocument = z.infer<typeof authoringDocumentSchema>;
export type PublicationState = z.infer<typeof publicationStateSchema>;

export interface DocumentValidation {
  readonly success: boolean;
  readonly issues: readonly FriendlyValidationIssue[];
  readonly normalizedFields?: Readonly<Record<string, unknown>>;
}

export interface DraftInput {
  readonly id: string;
  readonly kind: EntityKind;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly content: string;
  readonly createdAt: string;
  readonly publicationState?: PublicationState;
  readonly publication?: AuthoringDocument["publication"];
}

export interface RenderedKnowledgeDocument {
  readonly format: string;
  readonly relativePath: string;
  readonly content: string;
}

export interface KnowledgeRenderer {
  readonly format: string;
  render(document: AuthoringDocument): Promise<RenderedKnowledgeDocument>;
}
