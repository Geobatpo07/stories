"""An in-memory GitHub for the publication tests (no network, the real API is never called).

It implements only the endpoints publishing uses, with the documented rules that matter here:
a tree entry with `sha: null` deletes (an error if the path does not exist), `sha` together with
`content` is an error, a ref update with `force: false` must be a fast-forward, and the tarball
endpoint answers 302 to a codeload host. Every request is recorded in `calls`.
"""

import hashlib
import io
import json
import tarfile
from collections.abc import Callable
from typing import Any

import httpx

OWNER_REPO = "octo/stories"
CONTENT_DIRS = (
    "programs",
    "questions",
    "hypotheses",
    "experiments",
    "notes",
    "software",
    "publications",
    "datasets",
    "presentations",
)
TOKEN = "github_pat_FAKE_TOKEN_VALUE"


def _sha(*parts: Any) -> str:
    return hashlib.sha1(json.dumps(parts, sort_keys=True, default=str).encode()).hexdigest()  # noqa: S324


def empty_repository() -> dict[str, bytes]:
    files = {"README.md": b"# stories\n"}
    files.update({f"content/{name}/.gitkeep": b"" for name in CONTENT_DIRS})
    return files


class FakeGitHub:
    def __init__(self, files: dict[str, bytes] | None = None, branch: str = "main") -> None:
        self.branch = branch
        self.trees: dict[str, dict[str, bytes]] = {}
        self.commits: dict[str, dict[str, Any]] = {}
        root_tree = self._store_tree(files if files is not None else empty_repository())
        self.head = self._store_commit("initial", root_tree, [])
        self.calls: list[tuple[str, str]] = []
        self.bodies: list[dict[str, Any]] = []
        self.bad_headers: list[str] = []
        self.fail: dict[tuple[str, str], int] = {}
        self.before_ref_update: Callable[[], None] | None = None

    # ---- model ---------------------------------------------------------------------------------

    def _store_tree(self, files: dict[str, bytes]) -> str:
        sha = _sha("tree", {k: v.hex() for k, v in sorted(files.items())})
        self.trees[sha] = dict(files)
        return sha

    def _store_commit(self, message: str, tree: str, parents: list[str]) -> str:
        sha = _sha("commit", message, tree, parents, len(self.commits))
        self.commits[sha] = {"tree": tree, "parents": parents, "message": message}
        return sha

    @property
    def files(self) -> dict[str, bytes]:
        return self.trees[self.commits[self.head]["tree"]]

    def advance_head(self, path: str, content: bytes) -> None:
        """Someone else pushes to the branch."""
        files = {**self.files, path: content}
        self.head = self._store_commit(f"other: {path}", self._store_tree(files), [self.head])

    def writes(self) -> list[tuple[str, str]]:
        return [call for call in self.calls if call[0] != "GET"]

    # ---- transport -----------------------------------------------------------------------------

    def client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(self._handle))

    def _tarball(self, sha: str) -> bytes:
        buffer = io.BytesIO()
        top = f"{OWNER_REPO.replace('/', '-')}-{sha[:7]}"
        with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
            for path, content in self.trees[self.commits[sha]["tree"]].items():
                info = tarfile.TarInfo(f"{top}/{path}")
                info.size = len(content)
                tar.addfile(info, io.BytesIO(content))
        return buffer.getvalue()

    def _handle(self, request: httpx.Request) -> httpx.Response:  # noqa: C901 - one switch
        path = request.url.path
        method = request.method
        if request.url.host == "codeload.github.com":
            self.calls.append((method, f"codeload{path}"))
            return httpx.Response(200, content=self._tarball(path.rsplit("/", 1)[1]))

        self.calls.append((method, path))
        headers = request.headers
        if headers.get("authorization") != f"Bearer {TOKEN}":
            self.bad_headers.append("authorization")
        if headers.get("accept") != "application/vnd.github+json":
            self.bad_headers.append("accept")
        if not headers.get("x-github-api-version") or not headers.get("user-agent"):
            self.bad_headers.append("version/user-agent")
        body = json.loads(request.content) if request.content else None
        if body is not None:
            self.bodies.append(body)

        base = f"/repos/{OWNER_REPO}"
        for (fail_method, suffix), status in self.fail.items():
            if method == fail_method and path.endswith(suffix):
                return httpx.Response(status, json={"message": "injected failure"})

        if method == "GET" and path == f"{base}/git/ref/heads/{self.branch}":
            return httpx.Response(200, json={"object": {"type": "commit", "sha": self.head}})
        if method == "GET" and path.startswith(f"{base}/git/commits/"):
            sha = path.rsplit("/", 1)[1]
            return httpx.Response(
                200, json={"sha": sha, "tree": {"sha": self.commits[sha]["tree"]}}
            )
        if method == "GET" and path.startswith(f"{base}/tarball/"):
            sha = path.rsplit("/", 1)[1]
            return httpx.Response(
                302,
                headers={
                    "location": f"https://codeload.github.com/{OWNER_REPO}/legacy.tar.gz/{sha}"
                },
            )
        if method == "POST" and path == f"{base}/git/trees":
            files = dict(self.trees[body["base_tree"]])
            for entry in body["tree"]:
                if "sha" in entry and "content" in entry:
                    return httpx.Response(422, json={"message": "use either sha or content"})
                if "sha" in entry and entry["sha"] is None:
                    if entry["path"] not in files:
                        return httpx.Response(422, json={"message": "cannot delete a missing file"})
                    del files[entry["path"]]
                else:
                    files[entry["path"]] = entry["content"].encode("utf-8")
            return httpx.Response(201, json={"sha": self._store_tree(files)})
        if method == "POST" and path == f"{base}/git/commits":
            sha = self._store_commit(body["message"], body["tree"], body["parents"])
            return httpx.Response(
                201, json={"sha": sha, "html_url": f"https://github.com/{OWNER_REPO}/commit/{sha}"}
            )
        if method == "PATCH" and path == f"{base}/git/refs/heads/{self.branch}":
            if self.before_ref_update is not None:
                self.before_ref_update()
            parents = self.commits[body["sha"]]["parents"]
            if body.get("force") is not True and self.head not in parents:
                return httpx.Response(422, json={"message": "Update is not a fast forward"})
            self.head = body["sha"]
            return httpx.Response(200, json={"object": {"sha": self.head}})
        return httpx.Response(404, json={"message": f"fake GitHub: no route for {method} {path}"})
