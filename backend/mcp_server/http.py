"""Mounts the Studio MCP tools over Streamable HTTP, protected by a single shared secret.

`mcp_server` was designed for stdio only (README.md: "whoever can launch this process is the
administrator" — no session, token, or authorization layer). Exposing it over the network turns
that trust boundary into a URL anyone can reach, including anonymous publication to GitHub. This
module restores an equivalent boundary with the simplest mechanism already used elsewhere in this
codebase (`REVALIDATE_SECRET`): one fixed token, checked before any MCP message is processed.
Not a full OAuth authorization server — there is exactly one administrator, so a client
registration/consent flow would authenticate no one this token doesn't already trust.

`MCP_REMOTE_TOKEN` is read once, by the caller (`api/app.py`), and this module never runs without
it: `create_app()` only mounts this at all when the variable is set.
"""

import hmac

from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from api.deps import AppDependencies

from .server import build_server

TOKEN_HEADER = b"x-token"


class RequireToken:
    """ASGI middleware: refuses any HTTP request whose `x-token` header does not match
    `token`, in constant time. Lifespan messages (the MCP session manager's startup/shutdown)
    pass straight through untouched.

    Named `x-token`, not something more descriptive like `x-mcp-token`: claude.ai's custom
    connector UI only sends request header names Anthropic has pre-approved (its docs list
    authorization, x-api-key, and x-auth-token as examples of the approved set, "and more" —
    a custom name outside that set is rejected at save time). `x-token` was observed as one of
    the offered names in that UI; a more specific name would need a support request to get
    approved first."""

    def __init__(self, app: ASGIApp, token: str) -> None:
        self._app = app
        self._token = token

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self._app(scope, receive, send)
            return
        headers = dict(scope["headers"])
        supplied = headers.get(TOKEN_HEADER, b"").decode("latin-1")
        if not hmac.compare_digest(supplied, self._token):
            response = PlainTextResponse("Unauthorized", status_code=401)
            await response(scope, receive, send)
            return
        await self._app(scope, receive, send)


def build_http_app(deps: AppDependencies, token: str) -> Starlette:
    """The Studio MCP tools (`build_server`, the same ones the stdio server exposes — no second
    implementation) over Streamable HTTP at the app root, gated by `token`. Mount the result under
    a path (e.g. `/mcp`) on the main FastAPI app; `streamable_http_path="/"` avoids doubling that
    path (otherwise this would answer on `/mcp/mcp`)."""
    server = build_server(deps)
    mcp_app = server.streamable_http_app(streamable_http_path="/")
    mcp_app.add_middleware(RequireToken, token=token)
    return mcp_app
