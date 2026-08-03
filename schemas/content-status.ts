import { z } from "zod";

/**
 * Lifecycle status shared by every content type. A Research Program and a
 * Dataset both move through the same coarse states; entity-specific state
 * (e.g. an Experiment's pass/fail outcome) belongs in that entity's own
 * schema, not here.
 */
export const contentStatusSchema = z.enum(["draft", "active", "paused", "concluded"]);

export type ContentStatus = z.infer<typeof contentStatusSchema>;
