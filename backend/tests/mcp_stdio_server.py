"""Entry point the stdio integration test launches as a real subprocess.

The server and its stdio transport are the production ones (the path of `mcp_server.server.main`);
only the dependencies differ: in-memory persistence and the in-memory GitHub, since a subprocess
cannot share Python fakes. Run as `python -m tests.mcp_stdio_server` from `backend/`."""

from mcp_server.server import build_server

from .api_support import Fakes
from .github_fake import FakeGitHub
from .mcp_support import github_dependencies

if __name__ == "__main__":
    build_server(github_dependencies(Fakes(), FakeGitHub())).run(transport="stdio")
