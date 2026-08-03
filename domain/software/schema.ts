import { z } from "zod";
import { baseFrontmatterSchema } from "@/schemas";

/** A Software entity documents a tool, library, or pipeline produced by the lab. */
export const softwareSchema = baseFrontmatterSchema.extend({
  repositoryUrl: z.string().url().optional(),
  license: z.string().min(1).optional(),
});

export type SoftwareFrontmatter = z.infer<typeof softwareSchema>;
