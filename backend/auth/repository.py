"""Port of auth/repository.ts: same collections and the same single fixed admin id.

Collections under the "auth" namespace: `auth` / `admin`, `auth-sessions` / <token>,
`auth-reset-tokens` / <token>. Every read is validated (a corrupt row raises, as with Zod).
"""

import asyncio

from runtime.ports import PersistencePort

from .types import AdminCredential, ResetToken, Session

ADMIN_COLLECTION = "auth"
ADMIN_ID = "admin"
SESSION_COLLECTION = "auth-sessions"
RESET_TOKEN_COLLECTION = "auth-reset-tokens"


class CredentialRepository:
    """The single admin credential record. There is exactly one: the id is fixed."""

    def __init__(self, persistence: PersistencePort) -> None:
        self._persistence = persistence

    async def get(self) -> AdminCredential | None:
        value = await self._persistence.load(ADMIN_COLLECTION, ADMIN_ID)
        return None if value is None else AdminCredential.model_validate(value)

    async def save(self, credential: AdminCredential) -> None:
        validated = AdminCredential.model_validate(credential.model_dump())
        await self._persistence.save(ADMIN_COLLECTION, ADMIN_ID, validated.to_row())


class SessionRepository:
    def __init__(self, persistence: PersistencePort) -> None:
        self._persistence = persistence

    async def create(self, session: Session) -> None:
        validated = Session.model_validate(session.model_dump())
        await self._persistence.save(SESSION_COLLECTION, validated.token, validated.to_row())

    async def get(self, token: str) -> Session | None:
        value = await self._persistence.load(SESSION_COLLECTION, token)
        return None if value is None else Session.model_validate(value)

    async def destroy(self, token: str) -> None:
        await self._persistence.delete(SESSION_COLLECTION, token)

    async def destroy_all(self) -> None:
        """Signs out every active session: called after a password reset."""
        sessions = await self._persistence.list(SESSION_COLLECTION)
        # The stored value is not validated here (TypeScript reads `session.token` as-is).
        await asyncio.gather(
            *(
                self._persistence.delete(SESSION_COLLECTION, session["token"])
                for session in sessions
            )
        )


class ResetTokenRepository:
    """Single-use: a token is deleted the moment it is consumed, valid or not."""

    def __init__(self, persistence: PersistencePort) -> None:
        self._persistence = persistence

    async def create(self, token: str, reset_token: ResetToken) -> None:
        validated = ResetToken.model_validate(reset_token.model_dump())
        await self._persistence.save(RESET_TOKEN_COLLECTION, token, validated.to_row())

    async def consume(self, token: str) -> ResetToken | None:
        value = await self._persistence.load(RESET_TOKEN_COLLECTION, token)
        await self._persistence.delete(RESET_TOKEN_COLLECTION, token)
        return None if value is None else ResetToken.model_validate(value)
