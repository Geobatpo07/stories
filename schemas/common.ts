import { z } from "zod";

/**
 * Shared primitive schemas reused across every content type and domain
 * module. Keep this file free of anything specific to a single entity.
 */

export const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case (e.g. cyclone-modeling)");

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format");

export const tagSchema = z.string().min(1);

export type Slug = z.infer<typeof slugSchema>;
export type IsoDate = z.infer<typeof isoDateSchema>;
