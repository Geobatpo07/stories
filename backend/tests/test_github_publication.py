"""Publication through GitHub's Git Data API (ADR-004 phase 4, step 2b), on an in-memory GitHub.

NOTHING here calls the real GitHub API; it has never been exercised (see PHASE4C-FINDINGS.md).
The fake follows the documented rules that matter: `sha: null` deletes, `force: false` means
fast-forward only, the tarball endpoint redirects.
"""

import asyncio
import io
import tarfile
from datetime import timedelta
from pathlib import Path

import httpx
import pytest

from authoring.types import RenderedDocument
from publication import (
    GitHubApiError,
    GitHubConfig,
    GitHubPublicationTarget,
    NextRevalidator,
    PublicationConfigurationError,
    PublicationConflictError,
    PublicationValidationError,
)
from publication.report import render_report
from publication.snapshot import extract_content_tree

from .api_support import NOW, make_harness
from .github_fake import OWNER_REPO, TOKEN, FakeGitHub, empty_repository

CONFIG = GitHubConfig(token=TOKEN, repository=OWNER_REPO)
PATH = "content/software/research-tool.mdx"
OLD_PATH = "content/software/old-name.mdx"


def mdx(slug: str = "research-tool", title: str = "Research Tool") -> str:
    return (
        f'---\ntitle: "{title}"\nslug: "{slug}"\ndescription: "A research artifact."\n'
        'date: "2026-08-03"\nstatus: "active"\ntags: []\n---\n\nA reproducible research tool.\n'
    )


def rendered(path: str = PATH, content: str | None = None) -> RenderedDocument:
    return RenderedDocument("mdx", path, content if content is not None else mdx())


def target_for(github: FakeGitHub, **kwargs):
    return GitHubPublicationTarget(CONFIG, github.client(), **kwargs)


def publish(github: FakeGitHub, document: RenderedDocument, previous: str | None = None):
    return asyncio.run(target_for(github).publish(document, previous))


def repository_with(**extra: str) -> dict[str, bytes]:
    files = empty_repository()
    files.update({path: content.encode() for path, content in extra.items()})
    return files


# ---- the happy path: one tree, one commit, one fast-forward ------------------------------------


def test_publishes_a_new_file_with_exactly_the_documented_call_sequence():
    github = FakeGitHub()
    parent = github.head
    report = publish(github, rendered())
    base = f"/repos/{OWNER_REPO}"
    assert github.calls == [
        ("GET", f"{base}/git/ref/heads/main"),
        ("GET", f"{base}/git/commits/{parent}"),
        ("GET", f"{base}/tarball/{parent}"),
        ("GET", f"codeload/{OWNER_REPO}/legacy.tar.gz/{parent}"),
        ("POST", f"{base}/git/trees"),
        ("POST", f"{base}/git/commits"),
        ("PATCH", f"{base}/git/refs/heads/main"),
    ]
    assert github.files[PATH] == mdx().encode()
    assert github.commits[github.head]["parents"] == [parent]
    assert report["commit"]["sha"] == github.head
    assert report["commit"]["parent"] == parent
    assert report["commit"]["written"] == PATH and report["commit"]["deleted"] is None
    assert report["commit"]["url"] == f"https://github.com/{OWNER_REPO}/commit/{github.head}"
    assert report["deployment"] == {"status": "pending"}
    assert report["build"]["success"] is True and report["build"]["entityCount"] == 1


def test_the_tree_entry_carries_the_content_inline_and_the_ref_update_is_not_forced():
    github = FakeGitHub()
    publish(github, rendered())
    tree_body, commit_body, ref_body = github.bodies[-3:]
    assert tree_body["tree"] == [{"path": PATH, "mode": "100644", "type": "blob", "content": mdx()}]
    assert tree_body["base_tree"] == github.commits[commit_body["parents"][0]]["tree"]
    assert commit_body["message"].startswith(f"Publish {PATH}")
    assert ref_body == {"sha": github.head, "force": False}


def test_every_request_carries_the_token_accept_version_and_user_agent():
    github = FakeGitHub()
    publish(github, rendered())
    assert github.bad_headers == []


def test_a_slug_change_writes_the_new_file_and_deletes_the_old_one_in_a_single_commit():
    github = FakeGitHub(repository_with(**{OLD_PATH: mdx("old-name", "Old Name")}))
    commits_before = len(github.commits)
    parent = github.head
    report = publish(github, rendered(), OLD_PATH)
    assert len(github.commits) == commits_before + 1  # one commit for both paths
    assert github.commits[github.head]["parents"] == [parent]
    assert PATH in github.files and OLD_PATH not in github.files
    tree_body = github.bodies[-3]
    assert {"path": OLD_PATH, "mode": "100644", "type": "blob", "sha": None} in tree_body["tree"]
    assert report["commit"]["deleted"] == OLD_PATH
    assert "replaces" in github.commits[github.head]["message"]


def test_a_previous_path_that_is_not_in_the_repository_is_not_deleted_through_the_api():
    github = FakeGitHub()
    publish(github, rendered(), OLD_PATH)
    assert all("sha" not in entry for entry in github.bodies[-3]["tree"])


def test_republishing_identical_content_makes_no_commit_and_needs_no_deployment():
    github = FakeGitHub(repository_with(**{PATH: mdx()}))
    head = github.head
    report = publish(github, rendered())
    assert github.writes() == []
    assert github.head == head
    assert report["commit"] is None and report["deployment"] == {"status": "not_required"}
    assert report["build"]["success"] is True  # the tree was still validated


def test_other_files_in_the_repository_are_left_alone():
    github = FakeGitHub()
    others = dict(github.files)
    publish(github, rendered())
    assert {k: v for k, v in github.files.items() if k != PATH} == others


# ---- validate BEFORE committing ----------------------------------------------------------------


def test_a_content_tree_that_does_not_build_makes_no_github_write_at_all():
    github = FakeGitHub(repository_with(**{"content/notes/broken.mdx": "---\ntitle: [oops\n---\n"}))
    head = github.head
    with pytest.raises(PublicationValidationError) as caught:
        publish(github, rendered())
    message = str(caught.value)
    assert message.startswith("Publication validation failed.\nBuild failed.\n")
    assert "[kernel]" in message and "broken.mdx" in message
    assert github.writes() == [] and github.head == head
    assert PATH not in github.files


def test_a_duplicate_id_in_the_tree_with_the_change_applied_is_refused_before_any_write():
    # The TypeScript pipeline never checked this; the Python build does (ADR-004 phase 3).
    other = "content/software/other-file.mdx"
    github = FakeGitHub(repository_with(**{other: mdx()}))  # same slug, different file
    with pytest.raises(PublicationValidationError) as caught:
        publish(github, rendered())
    assert "[duplicate-id]" in str(caught.value) and other in str(caught.value)
    assert github.writes() == []


def test_a_dangling_relationship_is_refused_before_any_write():
    question = (
        '---\ntitle: "Q"\nslug: "q"\ndescription: "d"\ndate: "2026-08-03"\nstatus: "draft"\n'
        'tags: []\nprogramSlug: "missing"\n---\n'
    )
    github = FakeGitHub()
    with pytest.raises(PublicationValidationError):
        publish(github, rendered("content/questions/q.mdx", question))
    assert github.writes() == []


def test_the_validated_tree_is_the_one_the_commit_is_built_on():
    seen: list[Path] = []

    def spy(root: Path):
        seen.append(root)
        return {
            "success": True,
            "entityCount": 0,
            "relationshipCount": 0,
            "countsByKind": {},
            "targetResults": [],
            "validationIssues": [],
            "elapsedMs": 0,
        }

    github = FakeGitHub(repository_with(**{"content/notes/keep.mdx": "x"}))
    parent = github.head
    asyncio.run(target_for(github, validate=spy).publish(rendered(), None))
    assert github.commits[github.head]["parents"] == [parent]
    assert github.calls.index(
        ("GET", f"/repos/{OWNER_REPO}/tarball/{parent}")
    ) < github.calls.index(("POST", f"/repos/{OWNER_REPO}/git/trees"))


# ---- failures leave GitHub untouched, and are reported plainly ---------------------------------


def test_a_branch_that_moved_while_publishing_is_a_conflict_not_an_overwrite():
    github = FakeGitHub()
    github.before_ref_update = lambda: github.advance_head("README.md", b"someone else\n")
    with pytest.raises(PublicationConflictError, match="nothing was published"):
        publish(github, rendered())
    assert PATH not in github.files  # the other person's head is intact
    assert github.files["README.md"] == b"someone else\n"


@pytest.mark.parametrize("step", ["/git/trees", "/git/commits"])
def test_a_github_failure_before_the_ref_update_leaves_the_branch_untouched(step):
    github = FakeGitHub()
    head = github.head
    github.fail[("POST", step)] = 500
    with pytest.raises(GitHubApiError) as caught:
        publish(github, rendered())
    assert caught.value.status == 500
    assert github.head == head


def test_a_failed_ref_update_other_than_a_conflict_is_a_github_error():
    github = FakeGitHub()
    github.fail[("PATCH", "/git/refs/heads/main")] = 403
    with pytest.raises(GitHubApiError) as caught:
        publish(github, rendered())
    assert caught.value.status == 403


def test_errors_never_contain_the_token():
    github = FakeGitHub()
    github.fail[("GET", "/git/ref/heads/main")] = 401
    with pytest.raises(GitHubApiError) as caught:
        publish(github, rendered())
    assert TOKEN not in str(caught.value)


@pytest.mark.parametrize("config", [None, GitHubConfig("", OWNER_REPO), GitHubConfig(TOKEN, "")])
def test_without_a_token_and_repository_it_refuses_before_any_request(config):
    github = FakeGitHub()
    target = GitHubPublicationTarget(config, github.client())
    with pytest.raises(PublicationConfigurationError, match="GITHUB_PUBLISH_TOKEN"):
        asyncio.run(target.publish(rendered(), None))
    assert github.calls == []


# ---- the archive is untrusted input ------------------------------------------------------------


def archive(members: dict[str, bytes], links: dict[str, str] | None = None) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, content in members.items():
            info = tarfile.TarInfo(name)
            info.size = len(content)
            tar.addfile(info, io.BytesIO(content))
        for name, target in (links or {}).items():
            info = tarfile.TarInfo(name)
            info.type = tarfile.SYMTYPE
            info.linkname = target
            tar.addfile(info)
    return buffer.getvalue()


def test_extraction_keeps_only_regular_files_under_content_and_strips_the_top_folder(tmp_path):
    data = archive(
        {
            "o-r-abc1234/content/notes/a.mdx": b"a",
            "o-r-abc1234/README.md": b"not content",
            "o-r-abc1234/backend/x.py": b"not content",
        }
    )
    assert extract_content_tree(data, tmp_path) == 1
    assert sorted(
        p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*") if p.is_file()
    ) == ["content/notes/a.mdx"]


def test_extraction_ignores_traversal_absolute_and_link_members(tmp_path):
    outside = tmp_path / "outside"
    outside.mkdir()
    root = tmp_path / "root"
    root.mkdir()
    data = archive(
        {
            "o-r-abc1234/content/../../escape.txt": b"x",
            "o-r-abc1234/content/notes/../../../escape2.txt": b"x",
            "/content/abs.txt": b"x",
            "o-r-abc1234/content/ok.mdx": b"ok",
        },
        links={"o-r-abc1234/content/link.mdx": "/etc/passwd"},
    )
    assert extract_content_tree(data, root) == 1
    assert [p.name for p in root.rglob("*") if p.is_file()] == ["ok.mdx"]
    assert list(outside.iterdir()) == [] and not (tmp_path / "escape.txt").exists()


# ---- report rendering (port of build/report.ts) ------------------------------------------------


def test_the_report_rendering_matches_the_typescript_format():
    report = {
        "success": False,
        "entityCount": 2,
        "relationshipCount": 1,
        "elapsedMs": 7,
        "countsByKind": {"software": 1, "dataset": 1},
        "targetResults": [
            {"name": "duckdb", "success": True, "durationMs": 3, "message": "Wrote 2 entities."},
            {"name": "manifest", "success": False, "durationMs": 0, "message": "Skipped."},
        ],
        "validationIssues": [{"check": "kernel", "message": "boom"}],
    }
    assert render_report(report) == "\n".join(
        [
            "Build failed.",
            "Entities: 2  Relationships: 1  Elapsed: 7ms",
            "By kind:",
            "  dataset: 1",
            "  software: 1",
            "Targets:",
            "  ✓ duckdb (3ms) — Wrote 2 entities.",
            "  ✗ manifest (0ms) — Skipped.",
            "Validation issues:",
            "  - [kernel] boom",
        ]
    )


# ---- through the real API route ----------------------------------------------------------------

ID = "44444444-4444-4444-8444-444444444444"
SESSION = "7" * 64


def stored_draft(**overrides):
    base = {
        "version": 1,
        "id": ID,
        "kind": "software",
        "publicationState": "draft",
        "fields": {
            "title": "Research Tool",
            "slug": "research-tool",
            "description": "A research artifact.",
            "date": "2026-08-03",
            "status": "active",
            "tags": [],
        },
        "content": "A reproducible research tool.",
        "createdAt": "2026-08-01T09:00:00.000Z",
        "updatedAt": "2026-08-01T09:00:00.000Z",
    }
    base.update(overrides)
    return base


def api(github: FakeGitHub, revalidate=None):
    calls: list[int] = []

    async def record() -> None:
        calls.append(1)

    h = make_harness(publication=target_for(github), revalidate=revalidate or record)
    h.fakes.seed_session(SESSION, NOW, NOW + timedelta(hours=1))
    h.fakes.put_row("knowledge", "software", ID, stored_draft())
    return h, calls


def publish_via_api(h):
    return h.post(f"/api/studio/documents/{ID}/publish", cookie=SESSION)


def test_the_route_commits_marks_the_draft_published_and_reports_deployment_pending():
    github = FakeGitHub()
    h, revalidated = api(github)
    response = publish_via_api(h)
    assert response.status_code == 200
    body = response.json()
    assert body["deployment"] == {"status": "pending"}
    assert body["report"]["commit"]["sha"] == github.head
    assert github.files[PATH] == mdx().encode()  # the MDX the Python renderer produced
    stored = h.fakes.rows_of("knowledge")[f"knowledge/software/{ID}"]
    assert stored["publicationState"] == "published"
    assert stored["publication"]["path"] == PATH
    assert revalidated == [1]


def test_the_stored_row_keeps_the_shape_the_typescript_app_can_still_read():
    # No new states or keys: the TS Studio parses this same row with a closed enum.
    github = FakeGitHub()
    h, _ = api(github)
    publish_via_api(h)
    stored = h.fakes.rows_of("knowledge")[f"knowledge/software/{ID}"]
    assert stored["publicationState"] in ("draft", "published")
    assert sorted(stored["publication"]) == ["kind", "path", "publishedAt", "slug"]


def test_a_failed_commit_leaves_the_draft_unpublished_and_refreshes_nothing():
    github = FakeGitHub()
    github.fail[("POST", "/git/commits")] = 500
    h, revalidated = api(github)
    before = h.fakes.rows_of("knowledge")[f"knowledge/software/{ID}"]
    response = publish_via_api(h)
    assert response.status_code == 422
    assert "create commit failed (500)" in response.json()["error"]
    assert h.fakes.rows_of("knowledge")[f"knowledge/software/{ID}"] == before
    assert before["publicationState"] == "draft"
    assert revalidated == []


def test_a_build_failure_answers_422_with_the_report_and_touches_nothing():
    github = FakeGitHub(repository_with(**{"content/notes/broken.mdx": "---\ntitle: [oops\n---\n"}))
    h, revalidated = api(github)
    response = publish_via_api(h)
    assert response.status_code == 422
    assert response.json()["error"].startswith("Publication validation failed.\nBuild failed.")
    assert github.writes() == []
    assert h.fakes.rows_of("knowledge")[f"knowledge/software/{ID}"]["publicationState"] == "draft"
    assert revalidated == []


def test_a_retry_after_a_lost_save_is_harmless_identical_content_makes_no_second_commit():
    github = FakeGitHub()
    h, _ = api(github)
    assert publish_via_api(h).status_code == 200
    head = github.head
    h.fakes.put_row("knowledge", "software", ID, stored_draft())  # as if the save had been lost
    again = publish_via_api(h)
    assert again.status_code == 200
    assert github.head == head
    assert again.json()["deployment"] == {"status": "not_required"}


# ---- revalidation ------------------------------------------------------------------------------


def test_the_revalidator_posts_with_the_secret_header_and_raises_when_refused():
    seen: list[httpx.Request] = []
    status = {"code": 200}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status["code"], text="nope")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    revalidate = NextRevalidator("https://stories.test/", "s3cret", client)
    asyncio.run(revalidate())
    assert str(seen[0].url) == "https://stories.test/api/internal/revalidate"
    assert seen[0].method == "POST" and seen[0].headers["x-revalidate-secret"] == "s3cret"
    status["code"] = 401
    with pytest.raises(RuntimeError, match="refused \\(401\\)"):
        asyncio.run(revalidate())


def test_the_revalidator_refuses_to_call_without_a_secret():
    with pytest.raises(RuntimeError, match="REVALIDATE_SECRET"):
        asyncio.run(NextRevalidator("https://stories.test", "")())
