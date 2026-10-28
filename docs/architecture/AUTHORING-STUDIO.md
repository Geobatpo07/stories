# Knowledge Authoring Studio architecture

## Boundary

The Studio is a private writing adapter over the existing platform. It does not replace the
public Presentation Layer or make the website read authoring storage. Since ADR-004 its backend
is the Python service in `backend/`; Next.js only renders the UI and relays requests.

```text
Dynamic Studio form (Next.js, app/studio/)
  → Next.js relay routes (app/api/studio/**, app/api/auth/**, lib/python-api.ts)
  → Python API (backend/api, FastAPI)
  → KnowledgeObjectRepository
  → Supabase persistence_records (namespace "knowledge")

Publish
  → validation (backend/authoring/definitions.py)
  → MDXRenderer (backend/authoring/renderer.py)
  → one GitHub commit of content/<registered-directory>/<slug>.mdx
  → Vercel builds the commit
  → Python knowledge build (backend/pipeline) → manifest.json + knowledge.duckdb
  → existing Platform Runtime
  → public Presentation Layer
```

Only pre-publication draft state lives in Supabase. The permanent research record stays a Git
history, as ADR-002 describes: the final MDX is a commit on the configured branch.

## Modules

- `backend/api/`: FastAPI app. Routes: `/api/auth/*` (login, logout, password reset),
  `/api/studio/documents` (list, save), `/api/studio/documents/{id}/publish`,
  `/api/authoring/definitions`. Gated by `STORIES_STUDIO_ENABLED` in production.
- `backend/authoring/`: field definitions and validation, repository over the persistence
  port, `MDXRenderer`, and `AuthoringWorkflow` (draft and publication lifecycle).
- `backend/auth/`: single-admin credentials, sessions, and password reset (scrypt hashing,
  opaque session tokens, Resend for email).
- `backend/publication/`: the GitHub publication target and the revalidation callback.
- `backend/mcp_server/`: local MCP server over the same `AuthoringWorkflow` (see its README).
- `lib/python-api.ts`, `lib/studio-client.ts`: the Next.js side of the boundary.
- `components/authoring/`, `app/studio/`: reusable form, editor, picker, preview, and status UI.
- `middleware.ts`, `auth/`: session check that still reads Supabase directly from Next.js.

The TypeScript `authoring/` and `kernel/authoring.ts` remain for the UI's types and for the
document list route (`GET /api/studio/documents`), which still reads Supabase from Next.js.
They are retired under ADR-004 Phase 7.

## Publication

`AuthoringWorkflow.publish` runs these steps in order: find the draft, validate it, render the
MDX, check the publication path stays inside the project root, commit through the
`PublicationTarget`, then save the document as `published`. Any failure before the commit leaves
the draft unchanged.

The GitHub target fetches the branch head, builds the resulting content tree with the real
build pipeline, and only then creates one tree, one commit and one fast-forward ref update. A
slug change writes the new file and deletes the old one in the same commit. The API reports the
deployment as `deployment: pending`; it does not follow or revert the Vercel build.

The renderer must stay byte-identical to the original TypeScript renderer (JS `trim()`
whitespace, `JSON.stringify` strings, `String()` numbers). `backend/tests/test_authoring_contract.py`
pins this.

## Extension points

- Add a publication format by implementing the renderer contract.
- Add a document kind through the schema and registration process; its Studio form is
  generated automatically.
- Multi-author conflict resolution is intentionally not implemented — the Studio is
  single-admin.
