import { z } from "zod";
import { baseFrontmatterSchema, slugSchema } from "@/schemas";

/**
 * A Knowledge Object is the general-purpose notebook entry: a Research
 * Note, Development Log, Reading Note, Tutorial, Conference Note, Book
 * Review, or Essay. `noteType` distinguishes them without requiring a
 * separate domain module per type — see README.md for why.
 */
export const knowledgeObjectTypeSchema = z.enum([
  "research-note",
  "development-log",
  "reading-note",
  "tutorial",
  "conference-note",
  "book-review",
  "essay",
]);

export const knowledgeSchema = baseFrontmatterSchema.extend({
  noteType: knowledgeObjectTypeSchema,
  programSlug: slugSchema.optional(),
});

export type KnowledgeObjectType = z.infer<typeof knowledgeObjectTypeSchema>;
export type KnowledgeFrontmatter = z.infer<typeof knowledgeSchema>;
