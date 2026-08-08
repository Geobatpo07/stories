import { z } from "zod";
import { createEntity } from "./pipeline/factory";
import { normalizeFrontmatter } from "./pipeline/normalization";
import { resolveRelationships } from "./pipeline/relationships";
import { buildKnowledgeGraph } from "./pipeline/graph";
import { registrations } from "./registry/registrations";
import type { EntityKind, KnowledgeEntity, KnowledgeGraph } from "./types";

export type AuthoringFieldType =
  "text" | "textarea" | "date" | "url" | "select" | "tags" | "string-list" | "relationship";

export interface AuthoringFieldDefinition {
  readonly name: string;
  readonly label: string;
  readonly description?: string;
  readonly type: AuthoringFieldType;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly options?: readonly string[];
  readonly relationshipKind?: EntityKind;
  readonly defaultValue?: unknown;
}

export interface AuthoringEntityDefinition {
  readonly kind: EntityKind;
  readonly label: string;
  readonly publicKind: "Program" | "Project" | "Story" | "Artifact" | "Investigation";
  readonly contentDir: string;
  readonly fields: readonly AuthoringFieldDefinition[];
}

export interface FriendlyValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface AuthoringValidationResult {
  readonly success: boolean;
  readonly data?: Readonly<Record<string, unknown>>;
  readonly issues: readonly FriendlyValidationIssue[];
}

export function listAuthoringDefinitions(): readonly AuthoringEntityDefinition[] {
  return registrations.map((registration) => ({
    kind: registration.kind,
    label: humanize(registration.kind),
    publicKind: publicKind(registration.kind),
    contentDir: registration.contentDir,
    fields: fieldsFor(registration),
  }));
}

export function getAuthoringDefinition(kind: EntityKind): AuthoringEntityDefinition {
  const definition = listAuthoringDefinitions().find((item) => item.kind === kind);
  if (!definition) throw new Error(`Unknown knowledge kind: ${kind}`);
  return definition;
}

export function validateAuthoringFields(
  kind: EntityKind,
  fields: Readonly<Record<string, unknown>>,
): AuthoringValidationResult {
  const registration = registrations.find((item) => item.kind === kind);
  if (!registration)
    return {
      success: false,
      issues: [{ field: "kind", message: "Choose a valid knowledge type." }],
    };
  const result = registration.schema.safeParse(fields);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        field: issue.path.join(".") || "document",
        message: friendlyMessage(issue),
      })),
    };
  }
  return { success: true, data: normalizeFrontmatter(result.data), issues: [] };
}

export function materializeAuthoringObjects(
  objects: readonly {
    kind: EntityKind;
    fields: Readonly<Record<string, unknown>>;
    content: string;
  }[],
): { readonly entities: readonly KnowledgeEntity[]; readonly graph: KnowledgeGraph } {
  const entities = objects.map((object) => {
    const registration = registrations.find((item) => item.kind === object.kind);
    if (!registration) throw new Error(`Unknown knowledge kind: ${object.kind}`);
    const validation = validateAuthoringFields(object.kind, object.fields);
    if (!validation.success || !validation.data) {
      throw new Error(
        validation.issues.map((issue) => `${issue.field}: ${issue.message}`).join("; "),
      );
    }
    return createEntity(
      registration,
      {
        sourcePath: `knowledge/${object.kind}/${String(validation.data.slug)}.json`,
        slug: String(validation.data.slug),
        data: validation.data,
        content: object.content,
      },
      validation.data as never,
    );
  });
  const resolved = resolveRelationships(entities, registrations);
  return { entities: resolved, graph: buildKnowledgeGraph(resolved) };
}

function fieldsFor(
  registration: (typeof registrations)[number],
): readonly AuthoringFieldDefinition[] {
  const object = registration.schema as unknown as z.ZodObject<z.ZodRawShape>;
  return Object.entries(object.shape).map(([name, field]) => {
    const relationship = registration.relationshipFields.find((item) => item.field === name);
    const unwrapped = unwrap(field);
    const array = unwrapped.schema instanceof z.ZodArray;
    const valueSchema = array
      ? unwrap((unwrapped.schema as z.ZodArray<z.ZodTypeAny>).element).schema
      : unwrapped.schema;
    const options = valueSchema instanceof z.ZodEnum ? valueSchema.options : undefined;
    return {
      name,
      label: humanize(name),
      description: field.description,
      type: relationship
        ? "relationship"
        : name === "description"
          ? "textarea"
          : name === "tags"
            ? "tags"
            : name === "date"
              ? "date"
              : options
                ? "select"
                : array
                  ? "string-list"
                  : hasUrlCheck(valueSchema) || name.toLowerCase().endsWith("url")
                    ? "url"
                    : "text",
      required: !field.isOptional() && !(field instanceof z.ZodDefault),
      multiple: array,
      options,
      relationshipKind: relationship?.targetKind,
      defaultValue: unwrapped.defaultValue,
    };
  });
}

function unwrap(input: z.ZodTypeAny): { schema: z.ZodTypeAny; defaultValue?: unknown } {
  let schema = input;
  let defaultValue: unknown;
  while (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodNullable ||
    schema instanceof z.ZodDefault
  ) {
    if (schema instanceof z.ZodDefault) defaultValue = schema._def.defaultValue();
    schema = schema._def.innerType;
  }
  return { schema, defaultValue };
}

function hasUrlCheck(schema: z.ZodTypeAny): boolean {
  return schema instanceof z.ZodString && schema._def.checks.some((check) => check.kind === "url");
}

function friendlyMessage(issue: z.ZodIssue): string {
  if (issue.code === "invalid_type" && issue.received === "undefined")
    return "This field is required.";
  if (issue.code === "invalid_string" && issue.validation === "url")
    return "Enter a complete web address, including https://.";
  if (issue.code === "invalid_enum_value") return "Choose one of the available values.";
  return issue.message.replace(/^String/, "This value");
}

function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function publicKind(kind: EntityKind): AuthoringEntityDefinition["publicKind"] {
  if (kind === "program") return "Program";
  if (kind === "question") return "Project";
  if (kind === "note") return "Story";
  if (kind === "hypothesis" || kind === "experiment") return "Investigation";
  return "Artifact";
}
