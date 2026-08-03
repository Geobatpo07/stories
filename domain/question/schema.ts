import { z } from "zod";
import { baseFrontmatterSchema, slugSchema } from "@/schemas";

/**
 * A Scientific Question is a specific, open question that belongs to a
 * Research Program and that Hypotheses and Experiments attach to.
 */
export const questionSchema = baseFrontmatterSchema.extend({
  programSlug: slugSchema,
});

export type QuestionFrontmatter = z.infer<typeof questionSchema>;
