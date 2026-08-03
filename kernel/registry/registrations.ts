import { datasetSchema } from "@/domain/dataset/schema";
import { experimentSchema } from "@/domain/experiment/schema";
import { hypothesisSchema } from "@/domain/hypothesis/schema";
import { knowledgeSchema } from "@/domain/knowledge/schema";
import { presentationSchema } from "@/domain/presentation/schema";
import { programSchema } from "@/domain/program/schema";
import { publicationSchema } from "@/domain/publication/schema";
import { questionSchema } from "@/domain/question/schema";
import { softwareSchema } from "@/domain/software/schema";
import type { EntityRegistration } from "./types";

/**
 * The complete set of known entity kinds. This is the ONLY place any
 * per-entity-type knowledge exists in the Kernel — every pipeline stage
 * loops over this list generically. Adding a 10th entity type means:
 * one value in `schemas/content-type.ts`'s enum, one `domain/<x>/` module,
 * one `content/<x>/` folder, and one entry here. Nothing else changes.
 */
export const registrations: readonly EntityRegistration[] = [
  {
    kind: "program",
    contentDir: "content/programs",
    schema: programSchema,
    relationshipFields: [
      { field: "relatedQuestionSlugs", cardinality: "many", targetKind: "question" },
    ],
  },
  {
    kind: "question",
    contentDir: "content/questions",
    schema: questionSchema,
    relationshipFields: [{ field: "programSlug", cardinality: "one", targetKind: "program" }],
  },
  {
    kind: "hypothesis",
    contentDir: "content/hypotheses",
    schema: hypothesisSchema,
    relationshipFields: [{ field: "questionSlug", cardinality: "one", targetKind: "question" }],
  },
  {
    kind: "experiment",
    contentDir: "content/experiments",
    schema: experimentSchema,
    relationshipFields: [
      { field: "questionSlug", cardinality: "one", targetKind: "question" },
      { field: "hypothesisSlug", cardinality: "one", targetKind: "hypothesis" },
    ],
  },
  {
    kind: "note",
    contentDir: "content/notes",
    schema: knowledgeSchema,
    relationshipFields: [{ field: "programSlug", cardinality: "one", targetKind: "program" }],
  },
  {
    kind: "software",
    contentDir: "content/software",
    schema: softwareSchema,
    relationshipFields: [],
  },
  {
    kind: "publication",
    contentDir: "content/publications",
    schema: publicationSchema,
    relationshipFields: [],
  },
  {
    kind: "dataset",
    contentDir: "content/datasets",
    schema: datasetSchema,
    relationshipFields: [],
  },
  {
    kind: "presentation",
    contentDir: "content/presentations",
    schema: presentationSchema,
    relationshipFields: [
      { field: "programSlug", cardinality: "one", targetKind: "program" },
      { field: "questionSlug", cardinality: "one", targetKind: "question" },
    ],
  },
];
