import { z } from "zod";
import { isoDateSchema, slugSchema, tagSchema } from "./common";
import { contentStatusSchema } from "./content-status";

/**
 * The frontmatter shape every content type extends. Domain modules
 * (`domain/*\/schema.ts`) call `baseFrontmatterSchema.extend({ ... })`
 * rather than redeclaring these fields.
 */
export const baseFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: slugSchema,
  description: z.string().min(1),
  date: isoDateSchema,
  status: contentStatusSchema.default("draft"),
  tags: z.array(tagSchema).default([]),
});

export type BaseFrontmatter = z.infer<typeof baseFrontmatterSchema>;
