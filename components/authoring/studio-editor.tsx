"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AuthoringDocument,
  AuthoringEntityDefinition,
  AuthoringFieldDefinition,
  FriendlyValidationIssue,
} from "@/authoring";
import { MarkdownDocument } from "@/components/knowledge/markdown-document";

export interface RelationshipOption {
  readonly kind: AuthoringDocument["kind"];
  readonly slug: string;
  readonly title: string;
}

export function StudioEditor({
  initialDocument,
  definition,
  relationshipOptions,
}: Readonly<{
  initialDocument: AuthoringDocument;
  definition: AuthoringEntityDefinition;
  relationshipOptions: readonly RelationshipOption[];
}>) {
  const [document, setDocument] = useState(initialDocument);
  const [issues, setIssues] = useState<readonly FriendlyValidationIssue[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "changed" | "error">("saved");
  const [publicationError, setPublicationError] = useState<string>();
  const mounted = useRef(false);

  const save = useCallback(async (current: AuthoringDocument) => {
    setSaveState("saving");
    const response = await fetch("/api/studio/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(current),
    });
    const payload = (await response.json()) as {
      document?: AuthoringDocument;
      validation?: { issues: readonly FriendlyValidationIssue[] };
      error?: string;
    };
    if (!response.ok || !payload.document) {
      setSaveState("error");
      throw new Error(payload.error ?? "Draft could not be saved.");
    }
    setIssues(payload.validation?.issues ?? []);
    const generatedSlug = payload.document.fields.slug;
    if (generatedSlug !== current.fields.slug) {
      setDocument((existing) => ({
        ...existing,
        fields: { ...existing.fields, slug: generatedSlug },
      }));
    }
    setSaveState("saved");
    return payload.document;
  }, []);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    setSaveState("changed");
    const timeout = window.setTimeout(() => void save(document).catch(() => undefined), 700);
    return () => window.clearTimeout(timeout);
  }, [document, save]);

  const changeField = (name: string, value: unknown) => {
    setDocument((current) => ({
      ...current,
      fields: { ...current.fields, [name]: value },
      updatedAt: new Date().toISOString(),
    }));
  };

  const publish = async () => {
    setPublicationError(undefined);
    try {
      const saved = await save(document);
      const response = await fetch(`/api/studio/documents/${saved.id}/publish`, { method: "POST" });
      const payload = (await response.json()) as { document?: AuthoringDocument; error?: string };
      if (!response.ok || !payload.document)
        throw new Error(payload.error ?? "Publication failed.");
      setDocument(payload.document);
      setIssues([]);
    } catch (error) {
      setPublicationError(error instanceof Error ? error.message : "Publication failed.");
    }
  };

  return (
    <div className="studio-workspace">
      <section className="studio-writing-pane" aria-label="Knowledge editor">
        <StudioToolbar
          document={document}
          saveState={saveState}
          issueCount={issues.length}
          onPublish={() => void publish()}
        />
        <MetadataEditor createdAt={document.createdAt} updatedAt={document.updatedAt}>
          <DynamicForm
            definition={definition}
            values={document.fields}
            issues={issues}
            relationshipOptions={relationshipOptions}
            onChange={changeField}
          />
        </MetadataEditor>
        <RichTextEditor
          value={document.content}
          onChange={(content) =>
            setDocument((current) => ({ ...current, content, updatedAt: new Date().toISOString() }))
          }
        />
        <ValidationPanel issues={issues} publicationError={publicationError} />
      </section>
      <RendererPreview
        title={String(document.fields.title ?? "Untitled research")}
        content={document.content}
      />
    </div>
  );
}

export function DynamicForm({
  definition,
  values,
  issues,
  relationshipOptions,
  onChange,
}: Readonly<{
  definition: AuthoringEntityDefinition;
  values: Readonly<Record<string, unknown>>;
  issues: readonly FriendlyValidationIssue[];
  relationshipOptions: readonly RelationshipOption[];
  onChange(name: string, value: unknown): void;
}>) {
  return (
    <div className="dynamic-form">
      {definition.fields.map((field) => (
        <DynamicField
          key={field.name}
          field={field}
          value={values[field.name]}
          error={issues.find((issue) => issue.field === field.name)?.message}
          relationshipOptions={relationshipOptions}
          onChange={(value) => onChange(field.name, value)}
        />
      ))}
    </div>
  );
}

function DynamicField({
  field,
  value,
  error,
  relationshipOptions,
  onChange,
}: Readonly<{
  field: AuthoringFieldDefinition;
  value: unknown;
  error?: string;
  relationshipOptions: readonly RelationshipOption[];
  onChange(value: unknown): void;
}>) {
  const id = `studio-${field.name}`;
  const describedBy = error ? `${id}-error` : undefined;
  if (field.type === "relationship") {
    return (
      <RelationshipPicker
        id={id}
        field={field}
        value={value}
        options={relationshipOptions.filter((option) => option.kind === field.relationshipKind)}
        error={error}
        onChange={onChange}
      />
    );
  }
  if (field.type === "tags") {
    return <TagSelector id={id} field={field} value={value} error={error} onChange={onChange} />;
  }
  return (
    <label className="studio-field" htmlFor={id}>
      <span>
        {field.label}
        {field.required ? " *" : ""}
      </span>
      {field.description && <small>{field.description}</small>}
      {field.type === "textarea" ? (
        <textarea
          id={id}
          value={stringValue(value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "select" ? (
        <select
          id={id}
          value={stringValue(value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Choose…</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {humanize(option)}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.type === "date" ? "date" : field.type === "url" ? "url" : "text"}
          value={field.type === "string-list" ? arrayValue(value).join(", ") : stringValue(value)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          onChange={(event) =>
            onChange(
              field.type === "string-list" ? splitList(event.target.value) : event.target.value,
            )
          }
        />
      )}
      {error && (
        <small id={`${id}-error`} className="field-error">
          {error}
        </small>
      )}
    </label>
  );
}

export function RelationshipPicker({
  id,
  field,
  value,
  options,
  error,
  onChange,
}: Readonly<{
  id: string;
  field: AuthoringFieldDefinition;
  value: unknown;
  options: readonly RelationshipOption[];
  error?: string;
  onChange(value: unknown): void;
}>) {
  const selected = field.multiple ? arrayValue(value) : [stringValue(value)];
  return (
    <fieldset className="studio-field relationship-picker">
      <legend>
        {field.label}
        {field.required ? " *" : ""}
      </legend>
      {!options.length && (
        <small>
          No published {humanize(field.relationshipKind ?? "knowledge")} records are available.
        </small>
      )}
      {options.map((option) => (
        <label key={`${option.kind}:${option.slug}`}>
          <input
            id={id}
            type={field.multiple ? "checkbox" : "radio"}
            name={field.name}
            checked={selected.includes(option.slug)}
            onChange={(event) => {
              if (field.multiple)
                onChange(
                  event.target.checked
                    ? [...selected, option.slug].filter(Boolean)
                    : selected.filter((item) => item !== option.slug),
                );
              else onChange(option.slug);
            }}
          />
          <span>{option.title}</span>
        </label>
      ))}
      {error && <small className="field-error">{error}</small>}
    </fieldset>
  );
}

export function TagSelector({
  id,
  field,
  value,
  error,
  onChange,
}: Readonly<{
  id: string;
  field: AuthoringFieldDefinition;
  value: unknown;
  error?: string;
  onChange(value: unknown): void;
}>) {
  return (
    <label className="studio-field" htmlFor={id}>
      <span>{field.label}</span>
      <input
        id={id}
        value={arrayValue(value).join(", ")}
        placeholder="research, methods, fieldwork"
        onChange={(event) => onChange(splitList(event.target.value))}
      />
      <small>Separate tags with commas.</small>
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}

export function RichTextEditor({
  value,
  onChange,
}: Readonly<{ value: string; onChange(value: string): void }>) {
  return (
    <label className="rich-text-editor">
      <span>Research narrative</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Begin with the question, observation, or result…"
        spellCheck
      />
      <small>Markdown, mathematics, figures, citations, tables, and footnotes are supported.</small>
    </label>
  );
}

export function KnowledgePreview({ title, content }: Readonly<{ title: string; content: string }>) {
  return (
    <article className="studio-preview-document">
      <p className="eyebrow">Live publication preview</p>
      <h1>{title}</h1>
      {content.trim() ? (
        <MarkdownDocument content={content} />
      ) : (
        <p className="empty-state">Your research narrative will appear here as you write.</p>
      )}
    </article>
  );
}

export function RendererPreview(props: Readonly<{ title: string; content: string }>) {
  return (
    <aside className="studio-preview-pane" aria-label="Publication preview">
      <KnowledgePreview {...props} />
    </aside>
  );
}

export function MetadataEditor({
  children,
  createdAt,
  updatedAt,
}: Readonly<{ children: React.ReactNode; createdAt: string; updatedAt: string }>) {
  return (
    <section className="metadata-editor">
      <div className="metadata-editor-heading">
        <h2>Research metadata</h2>
        <p>
          Created <time dateTime={createdAt}>{formatTimestamp(createdAt)}</time>
          <span aria-hidden="true"> · </span>
          Modified <time dateTime={updatedAt}>{formatTimestamp(updatedAt)}</time>
        </p>
      </div>
      {children}
    </section>
  );
}

export function DraftManager({
  state,
}: Readonly<{ state: "saved" | "saving" | "changed" | "error" }>) {
  const labels = {
    saved: "Draft saved",
    saving: "Saving…",
    changed: "Unsaved changes",
    error: "Save failed",
  } as const;
  return (
    <span className={`draft-state draft-state-${state}`} role="status">
      {labels[state]}
    </span>
  );
}

export function PublicationStatus({
  state,
  issueCount,
  onPublish,
}: Readonly<{
  state: AuthoringDocument["publicationState"];
  issueCount: number;
  onPublish(): void;
}>) {
  return (
    <div className="publication-status">
      <span>{state === "published" ? "Published" : "Private draft"}</span>
      <button type="button" onClick={onPublish}>
        {state === "published" ? "Publish update" : "Publish"}
        {issueCount ? ` · ${issueCount} issue${issueCount === 1 ? "" : "s"}` : ""}
      </button>
    </div>
  );
}

export function ValidationPanel({
  issues,
  publicationError,
}: Readonly<{ issues: readonly FriendlyValidationIssue[]; publicationError?: string }>) {
  if (!issues.length && !publicationError) return null;
  return (
    <section className="validation-panel" aria-live="polite">
      <h2>Before publishing</h2>
      {publicationError && <p>{publicationError}</p>}
      <ul>
        {issues.map((issue, index) => (
          <li key={`${issue.field}-${index}`}>
            <strong>{humanize(issue.field)}:</strong> {issue.message}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StudioToolbar({
  document,
  saveState,
  issueCount,
  onPublish,
}: Readonly<{
  document: AuthoringDocument;
  saveState: "saved" | "saving" | "changed" | "error";
  issueCount: number;
  onPublish(): void;
}>) {
  return (
    <header className="studio-toolbar">
      <DraftManager state={saveState} />
      <PublicationStatus
        state={document.publicationState}
        issueCount={issueCount}
        onPublish={onPublish}
      />
    </header>
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function arrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
