"""Port of auth/types.ts: the three stored record shapes and the cookie name.

Stored as JSON rows in `persistence_records` (namespace "auth"), read by `middleware.ts`, so the
field names, the order and the `Z`-suffixed ISO strings must not change.
"""

from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict

from schemas.zod_strings import Datetime, Email, NonEmpty

SESSION_COOKIE_NAME = "stories_studio_session"


class _Record(BaseModel):
    # Zod objects strip unknown keys and do no coercion.
    model_config = ConfigDict(extra="ignore", strict=True)

    def to_row(self) -> dict[str, Any]:
        return self.model_dump(mode="json")


class AdminCredential(_Record):
    """Single-admin credential record (ADR-001's single-author notebook)."""

    email: Email
    passwordHash: NonEmpty
    passwordSalt: NonEmpty
    updatedAt: Datetime


class Session(_Record):
    token: NonEmpty
    createdAt: Datetime
    expiresAt: Datetime


class ResetToken(_Record):
    email: Email
    expiresAt: Datetime


@dataclass(frozen=True)
class LoginResult:
    success: bool
    session_token: str | None = None
    expires_at: str | None = None


@dataclass(frozen=True)
class PasswordResetConfirmation:
    success: bool
    error: str | None = None
