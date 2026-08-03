import { z } from "zod";
import { baseFrontmatterSchema } from "@/schemas";

/** A Dataset entity documents data produced or consumed by the lab's research. */
export const datasetSchema = baseFrontmatterSchema.extend({
  sourceUrl: z.string().url().optional(),
  license: z.string().min(1).optional(),
});

export type DatasetFrontmatter = z.infer<typeof datasetSchema>;
