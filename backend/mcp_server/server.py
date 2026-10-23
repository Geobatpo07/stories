"""stdio MCP server wiring: registers the `StudioTools` operations and runs on stdin/stdout."""

from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

from api.deps import AppDependencies, build_default_dependencies

from .tools import StudioTools, ToolFailure

JsonObject = dict[str, Any]


def build_server(deps: AppDependencies) -> MCPServer:
    tools = StudioTools(deps)
    server = MCPServer("stories-studio")

    @server.tool()
    def list_definitions() -> list[JsonObject]:
        """List the document kinds and their fields (name, type, required, options, relationship
        target). Read this before drafting: `fields` must follow the definition of the `kind`."""
        return tools.definitions()

    @server.tool()
    async def list_documents() -> JsonObject:
        """List every existing document (drafts and published), newest first. Check this before
        proposing a document, to avoid duplicating one."""
        return await tools.documents()

    @server.tool()
    async def save_draft(
        kind: str,
        fields: JsonObject,
        content: str,
        id: str | None = None,
        created_at: str | None = None,
    ) -> JsonObject:
        """Create a draft, or update one by passing its `id`. The draft is stored even when
        invalid; `valid` and `issues` say what to fix. `slug` is derived from `title` if absent."""
        try:
            return await tools.save_draft(kind, fields, content, id, created_at)
        except ToolFailure as failure:
            raise ToolError(str(failure)) from failure

    @server.tool()
    async def publish_draft(id: str) -> JsonObject:
        """Publish a draft that validates: one GitHub commit after revalidation. Refused, with
        the reasons, when the draft is missing or invalid."""
        try:
            return await tools.publish(id)
        except ToolFailure as failure:
            raise ToolError(str(failure)) from failure

    return server


def main() -> None:
    build_server(build_default_dependencies()).run(transport="stdio")
