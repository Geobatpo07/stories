# Stories MCP server

A local MCP server (stdio) that lets Claude propose, validate and publish documents through the
same `AuthoringWorkflow` the Studio uses. It is a second front door onto the same core as
`backend/api`, not a second implementation: no validation or publication rule lives here.

## Trust model: read this first

**Whoever can launch this process is the administrator.** There is no token, session or
authorization layer. The server inherits the full power of the Studio admin: it can save drafts and
**publish to the GitHub repository** (a real commit on the configured branch).

- It runs locally, started by your MCP client from _your_ configuration. It listens on no port.
- Do not run it as a shared or network service. If that ever becomes necessary it needs service
  authentication first (ADR-004, Phase 6).
- The Studio's `STORIES_STUDIO_ENABLED` flag and the login session do not apply here: they guard
  the HTTP routes, and this process is not one.

## Configuration

The server reads the same environment variables as the API (`api/deps.py`). Required for real use:

| Variable                                    | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | where drafts are stored (`knowledge` namespace)                  |
| `GITHUB_PUBLISH_TOKEN`, `GITHUB_REPOSITORY` | the publication commit (`GITHUB_PUBLISH_BRANCH`, default `main`) |
| `NEXT_PUBLIC_SITE_URL`, `REVALIDATE_SECRET` | refresh the site after a publication (best effort)               |

Claude Code (`.mcp.json` or `claude mcp add`), from the repository root:

```json
{
  "mcpServers": {
    "stories-studio": {
      "command": "uv",
      "args": ["run", "--frozen", "--directory", "backend", "python", "-m", "mcp_server"],
      "env": {
        "SUPABASE_URL": "...",
        "SUPABASE_SERVICE_ROLE_KEY": "...",
        "GITHUB_PUBLISH_TOKEN": "...",
        "GITHUB_REPOSITORY": "owner/stories",
        "NEXT_PUBLIC_SITE_URL": "https://...",
        "REVALIDATE_SECRET": "..."
      }
    }
  }
}
```

Claude Desktop (`claude_desktop_config.json`) takes the same `mcpServers` entry; use an absolute
path for `--directory`. MCP clients pass only the variables listed in `env` (plus a few safe
system ones), so list every secret there. Do not commit a file containing them.

## Tools

| Tool               | Does                                             | Equivalent route                          |
| ------------------ | ------------------------------------------------ | ----------------------------------------- |
| `list_definitions` | document kinds and their fields                  | `GET /api/authoring/definitions`          |
| `list_documents`   | all drafts and published documents, newest first | `GET /api/studio/documents`               |
| `save_draft`       | create (no `id`) or update (`id`) a draft        | `POST /api/studio/documents`              |
| `publish_draft`    | validate again, commit to GitHub, mark published | `POST /api/studio/documents/{id}/publish` |

- `save_draft` stores a draft even when it is invalid, as the Studio does, and says so: the result
  has `valid: false` and the Studio's friendly `issues` (`{field, message}`). `slug` is derived
  from `title` when absent. `publicationState` and `publication` cannot be set from here: only
  `publish_draft` publishes.
- `publish_draft` refuses (tool error with the reasons) a missing or invalid draft.
- A tool error is a normal MCP result with `isError: true`; its text is prefixed by the SDK with
  `Error executing tool <name>: `.
