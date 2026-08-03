import { z } from "zod";
import { baseFrontmatterSchema, slugSchema } from "@/schemas";

/**
 * An Experiment is a single, falsifiable test run in service of a
 * Scientific Question (and, optionally, a specific Hypothesis).
 */
export const experimentSchema = baseFrontmatterSchema.extend({
  questionSlug: slugSchema,
  hypothesisSlug: slugSchema.optional(),
});

export type ExperimentFrontmatter = z.infer<typeof experimentSchema>;
