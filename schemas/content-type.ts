import { z } from "zod";

/**
 * The seven content collections under `content/`. Note this is six
 * knowledge-artifact types plus `program`, not the eight domain modules —
 * `hypothesis` has no standalone collection yet. See
 * docs/architecture/Architecture.md, "Open questions", for why.
 */
export const contentTypeSchema = z.enum([
  "program",
  "question",
  "note",
  "experiment",
  "software",
  "publication",
  "dataset",
]);

export type ContentType = z.infer<typeof contentTypeSchema>;
