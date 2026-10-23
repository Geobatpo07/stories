"""The four MCP tools, over the Studio API's in-memory fakes. Each test goes through a real MCP
`Client` connected in-process to the server, so tool registration, argument schemas and the error
mapping are exercised; the stdio transport itself is `test_mcp_stdio.py`."""

import asyncio
import json
from typing import Any

from mcp import Client
from mcp_types import CallToolResult

from api.deps import AppDependencies
from authoring.definitions import list_authoring_definitions
from mcp_server.server import build_server

from .api_support import Fakes, RecordingPublication
from .github_fake import FakeGitHub
from .mcp_support import CREATED, ID_A, VALID_FIELDS, dependencies, github_dependencies


def call(
    deps: AppDependencies, tool: str, arguments: dict[str, Any] | None = None
) -> CallToolResult:
    async def run() -> CallToolResult:
        async with Client(build_server(deps)) as client:
            return await client.call_tool(tool, arguments or {})

    return asyncio.run(run())


def payload(result: CallToolResult) -> Any:
    assert result.structured_content is not None, result
    content = result.structured_content
    return content["result"] if set(content) == {"result"} else content


def error_text(result: CallToolResult) -> str:
    assert result.is_error
    return "".join(getattr(block, "text", "") for block in result.content)


def draft_args(**overrides: Any) -> dict[str, Any]:
    args: dict[str, Any] = {
        "kind": "software",
        "fields": VALID_FIELDS,
        "content": "Body text",
        "id": ID_A,
        "created_at": CREATED,
    }
    return {**args, **overrides}


def test_the_four_tools_are_exposed() -> None:
    async def names() -> set[str]:
        async with Client(build_server(dependencies(Fakes()))) as client:
            return {tool.name for tool in (await client.list_tools()).tools}

    assert asyncio.run(names()) == {
        "list_definitions",
        "list_documents",
        "save_draft",
        "publish_draft",
    }


def test_list_definitions_is_the_studio_definitions() -> None:
    result = call(dependencies(Fakes()), "list_definitions")
    assert not result.is_error
    assert payload(result) == json.loads(json.dumps(list_authoring_definitions()))


def test_list_documents_is_empty_then_lists_a_saved_draft() -> None:
    deps = dependencies(Fakes())
    assert payload(call(deps, "list_documents")) == {"documents": []}
    call(deps, "save_draft", draft_args())
    [document] = payload(call(deps, "list_documents"))["documents"]
    assert document["id"] == ID_A and document["publicationState"] == "draft"


def test_a_valid_draft_is_stored_and_comes_back_with_its_id_and_the_derived_slug() -> None:
    fakes = Fakes()
    result = call(dependencies(fakes), "save_draft", draft_args())
    body = payload(result)
    assert not result.is_error
    assert (body["saved"], body["valid"], body["issues"]) == (True, True, [])
    assert body["document"]["id"] == ID_A
    assert body["document"]["fields"]["slug"] == "research-tool"  # derived from the title
    assert f"knowledge/software/{ID_A}" in fakes.rows_of("knowledge")


def test_a_draft_without_an_id_gets_one_and_updating_by_id_keeps_created_at() -> None:
    deps = dependencies(Fakes())
    first = payload(call(deps, "save_draft", draft_args(id=None, created_at=None)))
    new_id = first["document"]["id"]
    assert new_id != ID_A and first["document"]["createdAt"] == "2026-08-15T12:00:00.000Z"
    again = payload(call(deps, "save_draft", draft_args(id=new_id, content="Changed")))
    assert again["document"]["createdAt"] == first["document"]["createdAt"]
    assert again["document"]["content"] == "Changed"
    assert len(payload(call(deps, "list_documents"))["documents"]) == 1


def test_an_invalid_draft_comes_back_with_the_friendly_issues_not_an_exception() -> None:
    fakes = Fakes()
    fields = {"title": "T", "status": "nope"}
    result = call(dependencies(fakes), "save_draft", draft_args(fields=fields))
    body = payload(result)
    assert not result.is_error
    assert (body["saved"], body["valid"]) == (True, False)  # stored, but said so out loud
    assert {"field": "description", "message": "This field is required."} in body["issues"]
    assert {"field": "date", "message": "This field is required."} in body["issues"]
    assert {"field": "status", "message": "Choose one of the available values."} in body["issues"]
    assert f"knowledge/software/{ID_A}" in fakes.rows_of("knowledge")


def test_a_malformed_payload_is_a_tool_error_and_stores_nothing() -> None:
    fakes = Fakes()
    result = call(dependencies(fakes), "save_draft", draft_args(kind="not-a-kind"))
    assert "The draft payload is incomplete." in error_text(result)
    result = call(dependencies(fakes), "save_draft", draft_args(id="not-a-uuid"))
    assert "The draft payload is incomplete." in error_text(result)
    assert fakes.rows_of("knowledge") == {}


def test_publishing_an_unvalidated_draft_is_refused_like_the_studio_and_publishes_nothing() -> None:
    fakes = Fakes()
    deps = dependencies(fakes)
    call(deps, "save_draft", draft_args(fields={"title": "T", "slug": "t"}))
    result = call(deps, "publish_draft", {"id": ID_A})
    assert error_text(result).endswith(
        "publish_draft: description: This field is required.; date: This field is required."
    )
    assert fakes.published == []
    [stored] = fakes.rows_of("knowledge").values()
    assert stored["publicationState"] == "draft"


def test_publishing_a_missing_draft_is_refused() -> None:
    fakes = Fakes()
    result = call(dependencies(fakes), "publish_draft", {"id": ID_A})
    assert error_text(result).endswith("The draft could not be found.")
    assert fakes.published == []


def test_publishing_a_valid_draft_takes_the_workflow_path_and_revalidates_the_site() -> None:
    fakes = Fakes()
    revalidated: list[int] = []

    async def revalidate() -> None:
        revalidated.append(1)

    deps = dependencies(fakes, RecordingPublication(fakes, {"success": True}), revalidate)
    call(deps, "save_draft", draft_args())
    body = payload(call(deps, "publish_draft", {"id": ID_A}))
    [(rendered, previous)] = fakes.published
    assert rendered.relative_path == "content/software/research-tool.mdx" and previous is None
    assert body["document"]["publicationState"] == "published"
    assert body["document"]["publication"]["path"] == "content/software/research-tool.mdx"
    assert revalidated == [1]


def test_publishing_commits_to_github_through_the_phase_4_target() -> None:
    fakes, github = Fakes(), FakeGitHub()
    deps = github_dependencies(fakes, github)
    call(deps, "save_draft", draft_args())
    result = call(deps, "publish_draft", {"id": ID_A})
    assert not result.is_error, error_text(result)
    assert "content/software/research-tool.mdx" in github.files
    assert payload(result)["document"]["publicationState"] == "published"


def test_a_failing_revalidation_does_not_undo_a_publication() -> None:
    async def revalidate() -> None:
        raise RuntimeError("site down")

    fakes = Fakes()
    deps = dependencies(fakes, revalidate=revalidate)
    call(deps, "save_draft", draft_args())
    result = call(deps, "publish_draft", {"id": ID_A})
    assert not result.is_error
    assert len(fakes.published) == 1


def test_a_failing_publication_target_is_a_tool_error_and_leaves_the_draft_unpublished() -> None:
    class Failing:
        async def publish(self, rendered: Any, previous_path: str | None) -> dict[str, Any]:
            raise RuntimeError("GitHub said no")

    fakes = Fakes()
    deps = dependencies(fakes, Failing())
    call(deps, "save_draft", draft_args())
    assert error_text(call(deps, "publish_draft", {"id": ID_A})).endswith("GitHub said no")
    [stored] = fakes.rows_of("knowledge").values()
    assert stored["publicationState"] == "draft"
