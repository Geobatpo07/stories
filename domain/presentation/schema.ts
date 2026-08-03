import { z } from "zod";
import { baseFrontmatterSchema, slugSchema } from "@/schemas";

/**
 * A Presentation is a talk, poster, or seminar given about the lab's work.
 * `date` doubles as the event date, the same convention every other entity
 * uses for "the entity's own significant date." `programSlug` and
 * `questionSlug` are both optional and independent — a talk may stand on
 * its own, cover an entire Program, or focus on one Question.
 */
export const presentationSchema = baseFrontmatterSchema.extend({
  venue: z.string().min(1).optional(),
  slidesUrl: z.string().url().optional(),
  videoUrl: z.string().url().optional(),
  programSlug: slugSchema.optional(),
  questionSlug: slugSchema.optional(),
});

export type PresentationFrontmatter = z.infer<typeof presentationSchema>;
