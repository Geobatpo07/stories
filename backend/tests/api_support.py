"""Test support for the Studio API tests (port of app/api/test-support.ts).

The same three faked boundaries the TypeScript characterization tests used, with the real FastAPI
app and real workflows in between:
  * an in-memory `persistence_records` shared by both Supabase namespaces;
  * a Resend recorder;
  * no cookie jar: tests read the `Set-Cookie` header the test client really receives.
"""

import asyncio
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import httpx
from fastapi.testclient import TestClient

from api import create_app
from api.deps import AppDependencies
from auth.passwords import hash_password
from runtime.clock import FixedClock, iso_millis
from runtime.ports import EmailMessage

ADMIN_EMAIL = "admin@stories.test"
ADMIN_PASSWORD = "correct horse battery"
NOW = datetime(2026, 8, 15, 12, 0, 0, tzinfo=UTC)
COOKIE = "stories_studio_session"
TEST_ENV = {"VERCEL": "1", "STORIES_ENV": "test"}

_admin_hash: tuple[str, str] | None = None


def admin_hash() -> tuple[str, str]:
    """Hashing is slow on purpose, so it is done once per test session."""
    global _admin_hash
    if _admin_hash is None:
        _admin_hash = asyncio.run(hash_password(ADMIN_PASSWORD))
    return _admin_hash


def _key(namespace: str, collection: str, id: str) -> str:
    return json.dumps([namespace, collection, id])


@dataclass
class Fakes:
    records: dict[str, Any] = field(default_factory=dict)
    persistence_constructions: list[dict[str, str]] = field(default_factory=list)
    sent_emails: list[EmailMessage] = field(default_factory=list)
    email_failure: Exception | None = None
    published: list[Any] = field(default_factory=list)
    revalidations: int = 0

    def rows_of(self, namespace: str, collection: str | None = None) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for raw, value in self.records.items():
            ns, col, id = json.loads(raw)
            if ns == namespace and (collection is None or col == collection):
                out[f"{ns}/{col}/{id}"] = value
        return out

    def put_row(self, namespace: str, collection: str, id: str, value: Any) -> None:
        self.records[_key(namespace, collection, id)] = value

    def seed_admin(self, now: datetime = NOW) -> None:
        hashed, salt = admin_hash()
        self.put_row(
            "auth",
            "auth",
            "admin",
            {
                "email": ADMIN_EMAIL,
                "passwordHash": hashed,
                "passwordSalt": salt,
                "updatedAt": iso_millis(now),
            },
        )

    def seed_session(self, token: str, created_at: datetime, expires_at: datetime) -> None:
        self.put_row(
            "auth",
            "auth-sessions",
            token,
            {
                "token": token,
                "createdAt": iso_millis(created_at),
                "expiresAt": iso_millis(expires_at),
            },
        )


class FakePersistence:
    """The PostgREST adapter's behaviour: JSON round trip, `list` ordered by id, miss -> None."""

    def __init__(self, fakes: Fakes, namespace: str) -> None:
        self._fakes = fakes
        self.namespace = namespace

    async def save(self, collection: str, id: str, value: Any) -> None:
        self._fakes.records[_key(self.namespace, collection, id)] = json.loads(json.dumps(value))

    async def load(self, collection: str, id: str) -> Any | None:
        value = self._fakes.records.get(_key(self.namespace, collection, id))
        return None if value is None else json.loads(json.dumps(value))

    async def list(self, collection: str) -> list[Any]:
        rows = [
            (json.loads(raw)[2], value)
            for raw, value in self._fakes.records.items()
            if json.loads(raw)[:2] == [self.namespace, collection]
        ]
        return [json.loads(json.dumps(value)) for _, value in sorted(rows, key=lambda r: r[0])]

    async def delete(self, collection: str, id: str) -> None:
        self._fakes.records.pop(_key(self.namespace, collection, id), None)


class RecordingEmail:
    def __init__(self, fakes: Fakes) -> None:
        self._fakes = fakes

    async def send(self, message: EmailMessage) -> None:
        if self._fakes.email_failure is not None:
            raise self._fakes.email_failure
        self._fakes.sent_emails.append(message)


class RecordingPublication:
    """A working publication target, used only to cover the code after the (stubbed) commit."""

    def __init__(self, fakes: Fakes, report: dict[str, Any] | None = None) -> None:
        self._fakes = fakes
        self._report = report or {"success": True}

    async def publish(self, rendered: Any, previous_path: str | None) -> dict[str, Any]:
        self._fakes.published.append((rendered, previous_path))
        return self._report


@dataclass
class Harness:
    client: TestClient
    fakes: Fakes
    clock: FixedClock
    environ: dict[str, str]

    def request(
        self,
        method: str,
        url: str,
        *,
        json_body: Any = None,
        raw: str | bytes | None = None,
        cookie: str | None = None,
        ip: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> httpx.Response:
        merged = dict(headers or {})
        if cookie is not None:
            merged["cookie"] = f"{COOKIE}={cookie}"
        if ip is not None:
            merged["x-real-ip"] = ip
        self.client.cookies.clear()
        # starlette's TestClient answers with httpx2 responses (installed by the MCP SDK); same API.
        response: Any
        if raw is not None:
            merged.setdefault("content-type", "application/json")
            response = self.client.request(method, url, content=raw, headers=merged)
        elif json_body is not None:
            response = self.client.request(method, url, json=json_body, headers=merged)
        else:
            response = self.client.request(method, url, headers=merged)
        return cast(httpx.Response, response)

    def post(self, url: str, body: Any = None, **kwargs: Any) -> httpx.Response:
        return self.request("POST", url, json_body=body, **kwargs)

    def get(self, url: str, **kwargs: Any) -> httpx.Response:
        return self.request("GET", url, **kwargs)

    def set_cookies(self, response: Any) -> list[str]:
        cookies: list[str] = response.headers.get_list("set-cookie")
        return cookies


def make_harness(
    *,
    environ: dict[str, str] | None = None,
    seed_admin: bool = True,
    now: datetime = NOW,
    publication: Any = None,
    revalidate: Any = None,
) -> Harness:
    fakes = Fakes()
    clock = FixedClock(now)
    env = {**TEST_ENV, **(environ or {})}
    if seed_admin:
        fakes.seed_admin(now)
    deps = AppDependencies(
        environ=env,
        auth_persistence=FakePersistence(fakes, "auth"),
        knowledge_persistence=FakePersistence(fakes, "knowledge"),
        email=RecordingEmail(fakes),
        clock=clock,
    )
    if publication is not None:
        deps.publication = publication(fakes) if callable(publication) else publication
    if revalidate is not None:
        deps.revalidate = revalidate
    return Harness(TestClient(create_app(deps), raise_server_exceptions=True), fakes, clock, env)


def hours(count: float) -> timedelta:
    return timedelta(hours=count)
