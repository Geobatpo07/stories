# Stories Platform V3 — Knowledge Authoring Studio

Version 3 adds a private, model-first scientific writing workspace while preserving the V2
public research experience.

## Included

- Canonical Knowledge Objects with draft and publication lifecycle metadata.
- Zod-schema-generated forms for Programs, Projects, Stories, and Artifact types.
- Autosave, friendly validation, automatic slugs, tag editing, and visual relationships.
- Public-renderer live preview.
- Deterministic `MDXRenderer` and a format-neutral renderer contract.
- Transactional publication through the existing Knowledge Artifact Pipeline.
- Runtime and presentation refresh without an authoring-process restart.
- Local filesystem persistence through the existing Runtime port.

## Deliberately excluded

- Authentication and authorization.
- Collaboration and concurrent editing.
- LaTeX, PDF, HTML, JSON, and BibTeX renderer implementations.
- Hosted or serverless draft storage.

The Studio is enabled for local development and disabled on public production deployments by
default.
