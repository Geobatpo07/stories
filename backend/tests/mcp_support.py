"""Test support for the MCP server: the Studio API's fakes (`api_support`) behind the MCP adapter.

`dependencies()` is the same wiring the API tests use (in-memory `persistence_records`, fixed
clock); the publication target is either the API tests' recorder or the real GitHub target on the
in-memory GitHub of the publication tests."""

from typing import Any

from api.deps import AppDependencies
from publication import GitHubConfig, GitHubPublicationTarget
from runtime.clock import FixedClock

from .api_support import NOW, FakePersistence, Fakes, RecordingEmail, RecordingPublication
from .github_fake import OWNER_REPO, TOKEN, FakeGitHub

ID_A = "11111111-1111-4111-8111-111111111111"
CREATED = "2026-08-01T09:00:00.000Z"

VALID_FIELDS: dict[str, Any] = {
    "title": "Research Tool",
    "description": "A research artifact.",
    "date": "2026-08-03",
    "status": "active",
    "tags": [],
}


def dependencies(fakes: Fakes, publication: Any = None, revalidate: Any = None) -> AppDependencies:
    deps = AppDependencies(
        environ={"STORIES_ENV": "test"},
        auth_persistence=FakePersistence(fakes, "auth"),
        knowledge_persistence=FakePersistence(fakes, "knowledge"),
        email=RecordingEmail(fakes),
        clock=FixedClock(NOW),
        publication=publication or RecordingPublication(fakes),
    )
    if revalidate is not None:
        deps.revalidate = revalidate
    return deps


def github_dependencies(fakes: Fakes, github: FakeGitHub) -> AppDependencies:
    config = GitHubConfig(token=TOKEN, repository=OWNER_REPO)
    return dependencies(fakes, GitHubPublicationTarget(config, github.client()))
