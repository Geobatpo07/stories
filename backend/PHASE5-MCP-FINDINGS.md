# Phase 5 findings: MCP server (ADR-004)

Branch `migration/phase5-mcp-server`, based on `main` at `51dda9f`. No PR opened. Evidence files are
in `backend/evidence/phase-5-mcp/` (`ruff.txt`, `mypy.txt`, `pytest-mcp.txt`, `pytest-all.txt`,
`exchange.txt`).

## 0. Does the core depend on an authenticated HTTP request? No, with three adapter-level steps

I read `authoring/workflow.py`, `authoring/repository.py`, `authoring/definitions.py` and
`api/app.py` in full (plus `authoring/types.py`, `api/bodies.py`, `api/deps.py`).

`AuthoringWorkflow` is a pure application service. Its constructor takes four ports and nothing
else (`authoring/workflow.py:68-78`):

```python
def __init__(self, repository: KnowledgeObjectRepository, renderer: KnowledgeRenderer,
             clock: ClockPort, publication: PublicationTarget) -> None:
```

No file under `authoring/` imports `fastapi`, `starlette`, `Request` or `auth`. `save_draft` takes a
plain dict, `publish` takes an id, `list_authoring_definitions()` takes nothing. The session check
is entirely in `api/app.py`: `studio_gate(request)` (`app.py:129-135`), applied at the top of each
route, before the workflow is called. So the claim "driving adapter over the same core" holds.

Not a dependency, but logic that lives in the HTTP adapter and not in the workflow. The MCP adapter
needs the same three steps, and I did not move them (`backend/api/` is off limits):

1. **Payload validation** with `DraftBody` (`api/bodies.py`). Reused by import, not copied.
2. **Slug derivation from the title** (`app.py:236-238`), using `_js_falsy` (`app.py:50`). Reused by
   importing the private `_js_falsy`; the derivation itself is `authoring.slug_from_title`.
3. **Revalidation after a successful publish** (`app.py:259`, `revalidate_quietly`). Re-done in
   `mcp_server/tools.py` (about 5 lines: call `deps.revalidate()`, log and swallow any failure,
   because the commit already happened).

Recommendation, not done: move steps 2 and 3 into the workflow (or a small shared helper) so the two
adapters cannot drift. Importing a private name from `api.app` is the one thing here I would not
keep long term.

The wiring (repository + `MDXRenderer` + workflow, `app.py:92-93`) is also repeated in
`StudioTools.__init__`. Dependencies come from `api.deps.build_default_dependencies()`, so the
persistence, GitHub target and revalidator are the production ones, unchanged.

## 1. What was added

- `backend/mcp_server/` (`__init__.py`, `tools.py`, `server.py`, `__main__.py`, `README.md`).
  Not `backend/mcp/`, which would shadow the SDK.
- `mcp==2.3.0` in `pyproject.toml` (exact pin) and `uv.lock`. The lock diff is additions only: 18
  new packages, no existing pin moved. Note this is the **2.x** SDK: `FastMCP` is gone, the class is
  `mcp.server.mcpserver.MCPServer`, and `mcp_types` is a separate distribution.
- `"mcp_server"` added to `[tool.mypy] files`, so mypy --strict covers it. Ruff already covers all.
- Tests: `tests/test_mcp_tools.py` (13), `tests/test_mcp_stdio.py` (1), plus helpers
  `tests/mcp_support.py` and `tests/mcp_stdio_server.py`.

## 2. Tools and what each delegates to

| MCP tool                                              | Delegates to                                                                                        | Route it mirrors                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `list_definitions`                                    | `authoring.definitions.list_authoring_definitions()`                                                | `GET /api/authoring/definitions`          |
| `list_documents`                                      | `KnowledgeObjectRepository.list()`                                                                  | `GET /api/studio/documents`               |
| `save_draft(kind, fields, content, id?, created_at?)` | `DraftBody` validation, then `AuthoringWorkflow.slug_from_title` and `AuthoringWorkflow.save_draft` | `POST /api/studio/documents`              |
| `publish_draft(id)`                                   | `AuthoringWorkflow.publish`, then `deps.revalidate()`                                               | `POST /api/studio/documents/{id}/publish` |

Deliberate choices:

- `id` and `created_at` are optional for Claude's convenience (a new draft gets `uuid4()` and the
  clock's now). `DraftBody` still validates the result.
- `publicationState` and `publication` are **not exposed**. The Studio route accepts them from the
  client (a test documents that: "trusts a client supplied publicationState"). Exposing them would
  let Claude mark a draft `published` without going through `publish`, so a second publication path.
- An invalid draft is **stored and reported**, exactly like the Studio: `saved: true, valid: false,
issues: [{field, message}, ...]`. It is neither dropped nor stored silently.
- Failures that the Studio turns into 400/422 become MCP tool errors (`isError: true`) with the same
  text. The SDK prefixes the message with `Error executing tool <name>: `.

## 3. Test results

```
ruff check .          All checks passed!                      exit=0
mypy (strict)         Success: no issues found in 103 source files   exit=0
pytest (new, -v)      14 passed in 4.42s                      exit=0
pytest (whole backend) 1147 passed in 75.25s                  exit=0   (1133 before this phase + 14)
```

New tests, all through a real MCP `Client` (in-process for the 13 tool tests; subprocess for stdio):

- valid draft passes and returns its id, with the derived slug; no id gets a generated one; update
  by id keeps `createdAt`
- invalid draft returns the three expected friendly issues, `valid: false`, no tool error, row stored
- malformed payload (bad kind, bad id) is a tool error and stores nothing
- publish of an unvalidated draft is refused with the Studio's text
  (`description: This field is required.; date: This field is required.`), nothing published, draft
  stays `draft`
- publish of a missing draft is refused (`The draft could not be found.`)
- publish of a valid draft reaches the publication target, marks it published, revalidates
- publish through the **real `GitHubPublicationTarget`** on the in-memory GitHub of the Phase 4 tests
  commits `content/software/research-tool.mdx`
- failing revalidation does not undo a publication; failing target is a tool error and leaves the
  draft unpublished
- `test_a_real_client_drafts_and_publishes_over_stdio`: launches `python -m tests.mcp_stdio_server`
  as a subprocess, speaks stdio with a real client, lists the four tools, saves, publishes, and
  checks that an unknown id is refused.

## 4. Real exchange (stdio, `evidence/phase-5-mcp/exchange.txt`)

Server: production `build_server` over stdio, with in-memory persistence and in-memory GitHub.

Invalid draft, then a refused publish:

```
tools/call save_draft
request : {"kind":"software","fields":{"title":"Half Done","status":"nope"},"content":"x","id":"11111111-1111-4111-8111-111111111111"}
response: {"is_error":false,"structured_content":{"saved":true,"valid":false,
  "issues":[{"field":"description","message":"This field is required."},
            {"field":"date","message":"This field is required."},
            {"field":"status","message":"Choose one of the available values."}],
  "document":{"id":"1111...","publicationState":"draft","fields":{"title":"Half Done","status":"nope","slug":"half-done"}, ...}}}

tools/call publish_draft   {"id":"1111..."}
response: {"is_error":true,"text":"Error executing tool publish_draft: description: This field is required.; date: This field is required.; status: Choose one of the available values."}
```

Valid draft, then publish:

```
tools/call save_draft
request : {"kind":"software","fields":{"title":"Research Tool","description":"A research artifact.","date":"2026-08-03","status":"active","tags":[]},"content":"Body","id":"1111..."}
response: {"is_error":false,"structured_content":{"saved":true,"valid":true,"issues":[],
  "document":{"id":"1111...","publicationState":"draft","fields":{...,"slug":"research-tool"}, ...}}}

tools/call publish_draft   {"id":"1111..."}
response: {"is_error":false,"structured_content":{
  "document":{"id":"1111...","publicationState":"published",
              "publication":{"kind":"software","slug":"research-tool","path":"content/software/research-tool.mdx","publishedAt":"2026-08-15T12:00:00.000Z"}},
  "report":{"commit":{"sha":"c9450217...","branch":"main","parent":"4af6565f...","written":"content/software/research-tool.mdx","deleted":null},
            "deployment":{"status":"pending"},"build":{"entityCount":1,"success":true}}}}
```

(The last response is trimmed by the capture script; the test asserts `publicationState` is
`published`.) The commit sha is the fake GitHub's.

I also launched the exact command from the README (`uv run --frozen --directory backend python -m
mcp_server`, no environment) with a client: `list_definitions` returns the 9 kinds, and
`publish_draft` without configuration fails cleanly (`Request URL is missing an 'http://' or
'https://' protocol.`) instead of crashing the server.

## 5. Side effects of the new dependency, to know about

- Adding `mcp` installs `httpx2`. Starlette's `TestClient` prefers `httpx2` when present, so it now
  returns `httpx2` responses. Runtime behaviour of the existing 1133 tests did not change (they
  pass), but mypy --strict failed on 4 lines of two existing test files that annotated those
  responses as `httpx.Response`. I fixed it in `tests/api_support.py` and `tests/test_api_cors.py`
  with a `cast`/`Any` (4 changed lines, comment included). This is the only edit outside the new
  module and the two config files; `backend/api/`, `backend/auth/` and the TypeScript side are
  untouched.
- Before this change Starlette's fallback to plain `httpx` printed a deprecation warning; that path
  is no longer used.

## 6. CI

The new tests live in `backend/tests/`, so the existing step `uv run --frozen pytest -v` already
runs them, stdio test included (it uses `sys.executable`, i.e. the `uv sync --frozen` venv). I did
**not** add a duplicate step, and did not touch `ci.yml`: ruff and mypy steps are still blocking and
cover the new code (mypy via the `files` entry). CI has not run on this branch yet (nothing pushed
for a PR; see below), so "green in CI" is **not** established, only green locally.

## 7. Not done, or still risky

- **Not run in CI.** Local results only (Windows, Python 3.12). The stdio test spawns a subprocess;
  I have not seen it on Linux CI. `pywin32` is in the lock under a win32 marker only.
- **No real remote MCP client.** The client in the tests and the exchange is the official SDK's, not
  Claude Code or Claude Desktop. I did not configure Claude Code or Desktop against this server; the
  README snippets are untested in those apps (the underlying command was tested as above).
- **No exercise against the real GitHub, Supabase or Resend.** Publication was tested only against
  the in-memory GitHub of the Phase 4 tests and the recorder. Nothing here proves a real commit.
- **Blast radius is the admin's.** A launched server can commit to the real branch. There is no
  confirmation step: "publish" is one tool call. That is the stated trust model, but note that
  Claude (not a human) decides when to call it unless the MCP client asks for approval per call.
- **The Studio kill-switch does not apply.** `STORIES_STUDIO_ENABLED=false` in production turns the
  HTTP Studio off with a 404, but does not stop this process. It guards routes, not the core.
- **Private import** `from api.app import _js_falsy`, and the three duplicated adapter steps (section
  0). Flagged for a follow-up that moves them into the core.
- **Inherited quirk**: relationship errors always show the generic message "Review the selected
  relationships before publishing." (the documented TypeScript regex quirk in `workflow.py`), so
  Claude gets little help fixing a dangling reference. Not changed.
- **Concurrency**: no locking, same as the API. Two writers to the same draft last-write-wins.
- **Secrets in client config**: the README tells users to put the service-role and GitHub tokens in
  the MCP client's `env`; where that file lives and who can read it is on the user.
- Stdout is the protocol channel. Nothing in the server prints to it; library logs go to stderr
  (visible in `exchange.txt`). A future `print` would corrupt the stream.
