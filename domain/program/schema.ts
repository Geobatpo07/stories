import { z } from "zod";
import { baseFrontmatterSchema, slugSchema } from "@/schemas";

/**
 * A Research Program is the top-level container: "Environmental & Climate
 * Modeling," "Pure Mathematics," etc. Extends the shared frontmatter shape
 * with the fields specific to a program.
 *
 * Extension point: `leadResearcher` will likely become a reference to a
 * People/Contributors entity once the platform has more than one author —
 * kept as a plain string for now.
 */
export const programSchema = baseFrontmatterSchema.extend({
  theme: z.string().min(1),
  leadResearcher: z.string().min(1),
  relatedQuestionSlugs: z.array(slugSchema).default([]),
});

export type ProgramFrontmatter = z.infer<typeof programSchema>;
