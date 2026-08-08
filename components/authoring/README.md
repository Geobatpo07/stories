# Authoring components

The authoring component library is schema-driven and private to `/studio`.

- `StudioEditor` composes the complete writing workspace.
- `DynamicForm` renders serializable definitions produced by the Kernel.
- `RichTextEditor` edits narrative content without creating MDX files.
- `RelationshipPicker` presents resolved published knowledge rather than raw identifiers.
- `TagSelector` edits normalized tag arrays.
- `KnowledgePreview` and `RendererPreview` reuse the public Markdown renderer.
- `MetadataEditor` presents schema fields and system timestamps.
- `DraftManager` announces autosave state.
- `PublicationStatus` owns the explicit publish command.
- `ValidationPanel` presents friendly Kernel validation guidance.

Components contain no entity-specific schema or validation rules. New registered schemas are
rendered through the same composition.
