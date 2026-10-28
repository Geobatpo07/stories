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

from fastapi import FastAPI
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route
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


class _BareMountEndpoint:
    """Raw ASGI passthrough for a literal hit on the mount path with no trailing slash.

    `app.mount(path, mcp_app)` only ever matches `{path}/...` (Starlette's `Mount` compiles its
    regex as `path + "/{path:path}"`), never the bare `{path}` itself — that's a *different*,
    unmatched route as far as the outer router is concerned. With `redirect_slashes=True`
    (FastAPI's default), hitting the bare path 307-redirects to the slashed one, which is normally
    harmless. It isn't here: claude.ai's custom-connector UI strips the trailing slash from the
    URL when it saves a connector, and its MCP client does not follow that redirect — it reports
    "Impossible de se connecter au serveur" and never retries the corrected path. This endpoint is
    registered as an exact-path `Route` alongside the `Mount`, so the bare path gets Match.FULL
    immediately and the redirect logic never runs; it forwards straight into `mcp_app` with the
    path rewritten to `/` (the one route `mcp_app` actually has), so both spellings behave
    identically, headers, middleware (`RequireToken` included) and streaming responses alike."""

    def __init__(self, mcp_app: ASGIApp) -> None:
        self._mcp_app = mcp_app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self._mcp_app({**scope, "path": "/"}, receive, send)


def attach_mcp(app: FastAPI, mcp_app: Starlette, path: str = "/mcp") -> None:
    """Mount an already-built `mcp_app` (from `build_http_app`) on `app` at `path`, answering
    identically whether a client requests `path` or `path/` (see `_BareMountEndpoint`).

    Takes `mcp_app` rather than building it itself because the caller needs it before `app`
    exists too, to enter its lifespan (see the comment in `api/app.py` on why)."""
    app.mount(path, mcp_app)
    app.router.routes.append(Route(path, _BareMountEndpoint(mcp_app)))
