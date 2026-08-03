import { z } from "zod";

/**
 * The nine content collections under `content/`, one per domain module.
 * This is the canonical entity-kind vocabulary: the Knowledge Kernel's
 * registry (`kernel/registry/registrations.ts`) keys every registration
 * off one of these values, so the registry and the schema vocabulary can
 * never drift apart.
 */
export const contentTypeSchema = z.enum([
  "program",
  "question",
  "hypothesis",
  "note",
  "experiment",
  "software",
  "publication",
  "dataset",
  "presentation",
]);

export type ContentType = z.infer<typeof contentTypeSchema>;
