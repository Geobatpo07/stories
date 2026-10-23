"""The stdio wiring for real: a server subprocess, a real MCP client, one conversation.

The server is launched as `python -m tests.mcp_stdio_server` (production server and transport,
in-memory persistence and GitHub, see that module). The child gets only the environment the SDK's
client passes on, which is what a real MCP client configuration does too."""

import asyncio
import json
import sys
from pathlib import Path
from typing import Any

from mcp import Client
from mcp.client.stdio import StdioServerParameters

from .mcp_support import ID_A, VALID_FIELDS

BACKEND = Path(__file__).resolve().parents[1]
UNKNOWN_ID = "22222222-2222-4222-8222-222222222222"


def test_a_real_client_drafts_and_publishes_over_stdio() -> None:
    server = StdioServerParameters(
        command=sys.executable,
        args=["-m", "tests.mcp_stdio_server"],
        cwd=BACKEND,
        env={"PYTHONPATH": str(BACKEND)},
    )
    exchange: list[Any] = []

    async def conversation() -> None:
        async with Client(server, read_timeout_seconds=60) as client:
            tools = {tool.name for tool in (await client.list_tools()).tools}
            assert tools == {"list_definitions", "list_documents", "save_draft", "publish_draft"}

            saved_args = {"kind": "software", "fields": VALID_FIELDS, "content": "Body", "id": ID_A}
            saved = await client.call_tool("save_draft", saved_args)
            exchange.append({"call": "save_draft", "arguments": saved_args, "result": saved})
            assert not saved.is_error and saved.structured_content["valid"] is True

            publish_args = {"id": ID_A}
            published = await client.call_tool("publish_draft", publish_args)
            exchange.append(
                {"call": "publish_draft", "arguments": publish_args, "result": published}
            )
            assert not published.is_error, published
            assert published.structured_content["document"]["publicationState"] == "published"

            refused = await client.call_tool("publish_draft", {"id": UNKNOWN_ID})
            assert refused.is_error

    asyncio.run(conversation())
    results = [{**e, "result": e["result"].model_dump(mode="json")} for e in exchange]
    print(json.dumps(results, indent=1))
