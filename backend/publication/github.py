"""Publishing through GitHub's Git Data API (ADR-004 phase 4, step 2b).

Why the Git Data API and not the Contents API: the Contents API changes ONE file per call (it needs
that file's blob `sha`), and GitHub documents that its create/update and delete endpoints "will
conflict and you will receive errors" when used in parallel and "must" be used serially. A slug
change (write the new MDX, delete the old one) would therefore be two commits, and the second can
fail after the first succeeded. The Git Data API builds ONE tree holding both changes
(`tree[].sha = null` deletes a path), ONE commit, and moves the branch with ONE ref update that is
a fast-forward or nothing (`force: false`, the documented default). Either both paths change or
neither does.

Safety property (the inverse of the TypeScript version, which wrote first and rolled back):
nothing is written to GitHub until the content tree WITH the change applied has passed the real
build pipeline. A branch that moved in the meantime makes the ref update fail, not overwrite.

Out of scope here, deliberately: following Vercel's deployment of the commit and reverting it if
that deployment fails.
"""

import asyncio
import tempfile
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx

from authoring.types import RenderedDocument

from .errors import (
    GitHubApiError,
    PublicationConfigurationError,
    PublicationConflictError,
    PublicationValidationError,
)
from .report import render_report
from .snapshot import extract_content_tree, run_validation_build

API_VERSION = "2022-11-28"
USER_AGENT = "stories-studio-publisher"
DEFAULT_API_URL = "https://api.github.com"
FILE_MODE = "100644"


@dataclass(frozen=True)
class GitHubConfig:
    """`token`: a fine-grained personal access token limited to this one repository, with the
    repository permission "Contents: Read and write" (Metadata: read is implicit). See
    `.env.example` and docs/operations/DEPLOYMENT.md."""

    token: str
    repository: str  # "owner/name"
    branch: str = "main"
    api_url: str = DEFAULT_API_URL


class GitHubClient:
    """Only the six endpoints publishing needs. Never puts the token in an error message."""

    def __init__(self, config: GitHubConfig, client: httpx.AsyncClient) -> None:
        self._config = config
        self._client = client
        self._base = f"{config.api_url.removesuffix('/')}/repos/{config.repository}"

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self._config.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": API_VERSION,
            "User-Agent": USER_AGENT,
        }

    async def _send(
        self, action: str, method: str, path: str, body: Any = None, **kwargs: Any
    ) -> httpx.Response:
        response = await self._client.request(
            method, f"{self._base}{path}", headers=self._headers(), json=body, **kwargs
        )
        if not response.is_success:
            raise GitHubApiError(action, response.status_code, response.text[:500])
        return response

    async def branch_head(self, branch: str) -> tuple[str, str]:
        """(commit sha, tree sha) of the branch head. The ref form is `heads/<branch>`."""
        ref = (await self._send("get branch", "GET", f"/git/ref/heads/{branch}")).json()
        commit_sha = str(ref["object"]["sha"])
        commit = (await self._send("get commit", "GET", f"/git/commits/{commit_sha}")).json()
        return commit_sha, str(commit["tree"]["sha"])

    async def tarball(self, ref: str) -> bytes:
        """The repository archive at `ref` (a 302 to codeload; redirects must be followed)."""
        response = await self._send(
            "download archive", "GET", f"/tarball/{ref}", follow_redirects=True
        )
        return response.content

    async def create_tree(self, base_tree: str, entries: list[dict[str, Any]]) -> str:
        body = {"base_tree": base_tree, "tree": entries}
        return str((await self._send("create tree", "POST", "/git/trees", body)).json()["sha"])

    async def create_commit(self, message: str, tree: str, parent: str) -> tuple[str, str]:
        body = {"message": message, "tree": tree, "parents": [parent]}
        created = (await self._send("create commit", "POST", "/git/commits", body)).json()
        return str(created["sha"]), str(created.get("html_url", ""))

    async def move_branch(self, branch: str, sha: str) -> None:
        """Fast-forward only (`force: false`). A moved branch is a conflict, never an overwrite."""
        try:
            await self._send(
                "update branch", "PATCH", f"/git/refs/heads/{branch}", {"sha": sha, "force": False}
            )
        except GitHubApiError as error:
            if error.status in (409, 422):
                raise PublicationConflictError(
                    f"The {branch} branch changed while publishing, so nothing was published. "
                    f"Try again. ({error})"
                ) from error
            raise


def _apply(
    root: Path, rendered: RenderedDocument, previous_path: str | None
) -> tuple[bool, str | None]:
    """Applies the change to the extracted snapshot. Returns (content changed, path to delete)."""
    target = root / rendered.relative_path
    unchanged = target.is_file() and target.read_bytes() == rendered.content.encode("utf-8")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(rendered.content.encode("utf-8"))
    deleted: str | None = None
    # Deleting a path that is not in the tree is an API error, so only delete what exists.
    if previous_path and previous_path != rendered.relative_path:
        old = root / previous_path
        if old.is_file():
            old.unlink()
            deleted = previous_path
    return not unchanged, deleted


class GitHubPublicationTarget:
    """`PublicationTarget` over GitHub. Constructed without a config it raises at publish time
    (construction must never fail: the API starts without GitHub credentials)."""

    def __init__(
        self,
        config: GitHubConfig | None = None,
        client: httpx.AsyncClient | None = None,
        validate: Callable[[Path], dict[str, Any]] = run_validation_build,
    ) -> None:
        self._config = config
        self._client = client
        self._validate = validate

    async def publish(
        self, rendered: RenderedDocument, previous_path: str | None
    ) -> dict[str, Any]:
        if self._config is None or not self._config.token or not self._config.repository:
            raise PublicationConfigurationError(
                "GitHub publishing is not configured: "
                "set GITHUB_PUBLISH_TOKEN and GITHUB_REPOSITORY."
            )
        if self._client is not None:
            return await self._publish(self._config, self._client, rendered, previous_path)
        async with httpx.AsyncClient(timeout=30.0) as client:
            return await self._publish(self._config, client, rendered, previous_path)

    async def _publish(
        self,
        config: GitHubConfig,
        http: httpx.AsyncClient,
        rendered: RenderedDocument,
        previous_path: str | None,
    ) -> dict[str, Any]:
        github = GitHubClient(config, http)

        # 1. Pin one snapshot: the commit validated is the commit the new one is built on.
        head_sha, head_tree = await github.branch_head(config.branch)
        archive = await github.tarball(head_sha)

        # 2. Validate BEFORE any write: the real build on the tree with the change applied.
        with tempfile.TemporaryDirectory(prefix="stories-publish-") as directory:
            root = Path(directory)
            await asyncio.to_thread(extract_content_tree, archive, root)
            changed, deleted = await asyncio.to_thread(_apply, root, rendered, previous_path)
            build = await asyncio.to_thread(self._validate, root)
        if not build["success"]:
            raise PublicationValidationError(
                f"Publication validation failed.\n{render_report(build)}"
            )

        if not changed and deleted is None:
            return {
                "success": True,
                "build": build,
                "commit": None,
                "deployment": {"status": "not_required"},
            }

        # 3. One tree, one commit, one fast-forward ref update.
        entries: list[dict[str, Any]] = [
            {
                "path": rendered.relative_path,
                "mode": FILE_MODE,
                "type": "blob",
                "content": rendered.content,
            }
        ]
        if deleted is not None:
            entries.append({"path": deleted, "mode": FILE_MODE, "type": "blob", "sha": None})
        tree = await github.create_tree(head_tree, entries)
        message = f"Publish {rendered.relative_path}" + (
            f" (replaces {deleted})" if deleted else ""
        )
        commit_sha, commit_url = await github.create_commit(
            f"{message}\n\nPublished from the Stories Studio.", tree, head_sha
        )
        await github.move_branch(config.branch, commit_sha)

        return {
            "success": True,
            "build": build,
            "commit": {
                "sha": commit_sha,
                "url": commit_url,
                "branch": config.branch,
                "parent": head_sha,
                "written": rendered.relative_path,
                "deleted": deleted,
            },
            # Vercel builds and deploys this commit on its own; following that is a later step.
            "deployment": {"status": "pending"},
        }
