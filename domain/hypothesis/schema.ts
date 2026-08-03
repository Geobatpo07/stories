import { z } from "zod";
import { baseFrontmatterSchema, slugSchema } from "@/schemas";

/**
 * A Hypothesis is a falsifiable claim proposed in service of a Scientific
 * Question. It has no standalone `content/` collection yet — see README.md.
 */
export const hypothesisSchema = baseFrontmatterSchema.extend({
  questionSlug: slugSchema,
});

export type HypothesisFrontmatter = z.infer<typeof hypothesisSchema>;
