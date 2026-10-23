"""Request bodies, validated like the Zod schemas in the six TypeScript routes (strict, unknown
keys stripped, no coercion). A failure is a 400 with the route's own message, never a 422."""

import json
from typing import Any, Literal

from fastapi import Request
from pydantic import BaseModel, ConfigDict

from schemas.content_type import ContentType
from schemas.zod_strings import Datetime, Email, MinChars8, NonEmpty, Uuid


class _Body(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)


class LoginBody(_Body):
    email: Email
    password: NonEmpty


class ResetRequestBody(_Body):
    email: Email


class ResetConfirmBody(_Body):
    token: NonEmpty
    password: MinChars8


class DraftPublication(_Body):
    # The route schema is looser than the stored one (`slug` / `path` have no min length), so an
    # empty slug passes here and fails later when the repository validates the document (a 500).
    kind: ContentType
    slug: str
    path: str
    publishedAt: Datetime


class DraftBody(_Body):
    id: Uuid
    kind: ContentType
    fields: dict[str, Any]
    content: str
    createdAt: Datetime
    publicationState: Literal["draft", "published"] = None  # type: ignore[assignment]
    publication: DraftPublication = None  # type: ignore[assignment]


def _reject_constant(name: str) -> Any:
    raise json.JSONDecodeError(f"Unexpected token {name}", name, 0)


async def read_json(request: Request) -> Any:
    """`await request.json()`: invalid JSON raises (it is NOT turned into a 400), like Next."""
    return json.loads(await request.body(), parse_constant=_reject_constant)
