import { z } from "zod";
import { baseFrontmatterSchema } from "@/schemas";

/**
 * A Publication is a formal scholarly output: a paper, preprint, or
 * conference proceeding. Citation fields are optional because a
 * publication may be entered before it has a venue or DOI (e.g. while
 * still a preprint or under review).
 */
export const publicationSchema = baseFrontmatterSchema.extend({
  venue: z.string().min(1).optional(),
  doi: z.string().min(1).optional(),
  preprintUrl: z.string().url().optional(),
  coAuthors: z.array(z.string().min(1)).default([]),
});

export type PublicationFrontmatter = z.infer<typeof publicationSchema>;
