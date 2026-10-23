"""Port of auth/workflow.ts: login, logout, session validation and the password-reset lifecycle for
the single Studio admin. The ORDER of every check is part of the contract (see the Phase 4
characterization tests): e.g. `confirm_password_reset` consumes the token before it looks at the
expiry or the email, so an expired or wrong-email token is burned.
"""

from datetime import timedelta

from runtime.clock import epoch_millis, iso_millis, parse_instant
from runtime.ports import ClockPort, EmailMessage, EmailPort

from .passwords import generate_token, hash_password, verify_password
from .repository import CredentialRepository, ResetTokenRepository, SessionRepository
from .types import (
    AdminCredential,
    LoginResult,
    PasswordResetConfirmation,
    ResetToken,
    Session,
)

SESSION_TTL = timedelta(hours=12)
RESET_TOKEN_TTL = timedelta(hours=1)
INVALID_RESET_LINK = "This reset link is invalid or has already been used."


class AuthWorkflow:
    def __init__(
        self,
        credentials: CredentialRepository,
        sessions: SessionRepository,
        reset_tokens: ResetTokenRepository,
        email: EmailPort,
        clock: ClockPort,
        reset_url_base: str,
    ) -> None:
        self._credentials = credentials
        self._sessions = sessions
        self._reset_tokens = reset_tokens
        self._email = email
        self._clock = clock
        # e.g. `${NEXT_PUBLIC_SITE_URL}/studio/reset-password`; `?token=` is appended.
        self._reset_url_base = reset_url_base

    async def login(self, email: str, password: str) -> LoginResult:
        credential = await self._credentials.get()
        if credential is None or credential.email != email:
            # Hash a decoy so an unknown email takes roughly as long as a wrong password.
            await hash_password(password)
            return LoginResult(success=False)
        valid = await verify_password(password, credential.passwordSalt, credential.passwordHash)
        if not valid:
            return LoginResult(success=False)

        token = generate_token()
        created_at = self._clock.now()
        expires_at = created_at + SESSION_TTL
        await self._sessions.create(
            Session(token=token, createdAt=iso_millis(created_at), expiresAt=iso_millis(expires_at))
        )
        return LoginResult(success=True, session_token=token, expires_at=iso_millis(expires_at))

    async def logout(self, token: str) -> None:
        await self._sessions.destroy(token)

    async def validate_session(self, token: str) -> bool:
        session = await self._sessions.get(token)
        if session is None:
            return False
        if epoch_millis(parse_instant(session.expiresAt)) <= epoch_millis(self._clock.now()):
            await self._sessions.destroy(token)
            return False
        return True

    async def request_password_reset(self, email: str) -> None:
        """Resolves identically whether or not `email` is registered."""
        credential = await self._credentials.get()
        if credential is None or credential.email != email:
            return

        token = generate_token()
        expires_at = self._clock.now() + RESET_TOKEN_TTL
        await self._reset_tokens.create(
            token, ResetToken(email=credential.email, expiresAt=iso_millis(expires_at))
        )

        link = f"{self._reset_url_base}?token={token}"
        await self._email.send(
            EmailMessage(
                to=credential.email,
                subject="Reset your Stories Studio password",
                text=f"Open this link to choose a new password (expires in 1 hour): {link}",
                html=(
                    "<p>Open this link to choose a new password (expires in 1 hour):</p>"
                    f'<p><a href="{link}">{link}</a></p>'
                ),
            )
        )

    async def confirm_password_reset(
        self, token: str, new_password: str
    ) -> PasswordResetConfirmation:
        reset_token = await self._reset_tokens.consume(token)
        if reset_token is None:
            return PasswordResetConfirmation(success=False, error=INVALID_RESET_LINK)
        if epoch_millis(parse_instant(reset_token.expiresAt)) <= epoch_millis(self._clock.now()):
            return PasswordResetConfirmation(success=False, error="This reset link has expired.")
        credential = await self._credentials.get()
        if credential is None or credential.email != reset_token.email:
            return PasswordResetConfirmation(success=False, error=INVALID_RESET_LINK)

        hashed, salt = await hash_password(new_password)
        await self._credentials.save(
            AdminCredential(
                email=credential.email,
                passwordHash=hashed,
                passwordSalt=salt,
                updatedAt=iso_millis(self._clock.now()),
            )
        )
        await self._sessions.destroy_all()
        return PasswordResetConfirmation(success=True)
