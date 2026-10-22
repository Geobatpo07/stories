"""FastAPI port of the Studio routes (ADR-004 phase 4, step 2).

Faithful to the TypeScript routes as characterized by the Phase 4 tests: same paths, statuses,
bodies and error texts, same order of checks (Studio flag, then session, then body), same cookie
serialization. Where the TypeScript lets an exception escape (malformed JSON, a corrupt stored row,
a failing email provider) this does too, so the framework answers 500.
"""

from datetime import UTC, datetime
from email.utils import format_datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from pydantic import ValidationError

from auth import (
    SESSION_COOKIE_NAME,
    AuthWorkflow,
    CredentialRepository,
    ResetTokenRepository,
    SessionRepository,
)
from authoring.definitions import list_authoring_definitions
from authoring.renderer import MDXRenderer, js_trim
from authoring.repository import KnowledgeObjectRepository
from authoring.workflow import AuthoringWorkflow
from runtime.clock import epoch_millis, parse_instant

from .bodies import (
    DraftBody,
    LoginBody,
    ResetConfirmBody,
    ResetRequestBody,
    read_json,
)
from .deps import AppDependencies, build_default_dependencies, reset_url_base
from .settings import Settings

MAX_ATTEMPTS = 10
WINDOW_MS = 15 * 60 * 1000
UNIDENTIFIED_CLIENT = "unidentified-client"
_EPOCH = datetime(1970, 1, 1, tzinfo=UTC)


def _js_falsy(value: Any) -> bool:
    """JavaScript `!value`: unlike Python's `not`, an empty list or object is truthy."""
    return (
        value is None or value is False or value == 0 and not isinstance(value, list) or value == ""
    )


def _json(status: int, body: Any) -> JSONResponse:
    return JSONResponse(body, status_code=status)


def _http_date(moment: datetime) -> str:
    return format_datetime(moment.astimezone(UTC), usegmt=True)


def session_cookie(token: str, expires_at: str, secure: bool) -> str:
    """`Path; Expires; [Secure;] HttpOnly; SameSite=lax`, the order Next serializes."""
    expires = _http_date(parse_instant(expires_at))
    flags = "Secure; " if secure else ""
    return (
        f"{SESSION_COOKIE_NAME}={token}; Path=/; Expires={expires}; {flags}HttpOnly; SameSite=lax"
    )


def cleared_cookie() -> str:
    """`cookies().delete(name)`: empty value, epoch expiry, none of the other attributes."""
    return f"{SESSION_COOKIE_NAME}=; Path=/; Expires={_http_date(_EPOCH)}"


def create_app(dependencies: AppDependencies | None = None) -> FastAPI:
    deps = dependencies or build_default_dependencies()

    def settings_for() -> Settings:
        # Read at request time on purpose: the environment decides cookies, limits and gating.
        return Settings(deps.environ)

    credentials = CredentialRepository(deps.auth_persistence)
    sessions = SessionRepository(deps.auth_persistence)
    reset_tokens = ResetTokenRepository(deps.auth_persistence)
    auth = AuthWorkflow(
        credentials, sessions, reset_tokens, deps.email, deps.clock, reset_url_base(deps.environ)
    )
    drafts = KnowledgeObjectRepository(deps.knowledge_persistence)
    authoring = AuthoringWorkflow(drafts, MDXRenderer(), deps.clock, deps.publication)

    # In-memory only, per process, resets on restart (a documented simplification, same as the
    # TypeScript route). Keyed by client IP, never by email: see `client_key`.
    attempts: dict[str, tuple[int, int]] = {}

    def now_ms() -> int:
        return epoch_millis(deps.clock.now())

    def client_key(request: Request) -> str | None:
        """The rate-limit key. The IP is trusted only on Vercel, where the edge sets `x-real-ip`
        itself (identical to `x-forwarded-for`, which Vercel overwrites). Elsewhere a client could
        send the header and dodge the limit by rotating it, so it is ignored: in development there
        is no limit; in production everyone shares one fail-closed bucket. Never the email."""
        settings = settings_for()
        if settings.is_vercel:
            ip = js_trim(request.headers.get("x-real-ip", ""))
            if ip:
                return ip
        return UNIDENTIFIED_CLIENT if settings.is_production else None

    def rate_limited(key: str) -> bool:
        now = now_ms()
        entry = attempts.get(key)
        if entry is None or now - entry[1] > WINDOW_MS:
            attempts[key] = (1, now)
            return False
        attempts[key] = (entry[0] + 1, entry[1])
        return entry[0] + 1 > MAX_ATTEMPTS

    async def has_session(request: Request) -> bool:
        token = request.cookies.get(SESSION_COOKIE_NAME)
        if not token:
            return False
        return await auth.validate_session(token)

    async def studio_gate(request: Request) -> JSONResponse | None:
        """404 when the Studio is off, then 401 without a valid session; before any body is read."""
        if not settings_for().studio_enabled:
            return _json(404, {"error": "Not found"})
        if not await has_session(request):
            return _json(401, {"error": "Unauthorized"})
        return None

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

    # ---- /api/auth/* -------------------------------------------------------------------------

    @app.post("/api/auth/login")
    async def login(request: Request) -> Response:
        try:
            body = LoginBody.model_validate(await read_json(request))
        except ValidationError:
            return _json(400, {"error": "Email and password are required."})

        key = client_key(request)
        if key is not None and rate_limited(key):
            return _json(429, {"error": "Too many attempts. Try again in a few minutes."})

        result = await auth.login(body.email, body.password)
        if not result.success or not result.session_token or not result.expires_at:
            return _json(401, {"error": "Incorrect email or password."})

        response = _json(200, {"success": True})
        response.headers.append(
            "set-cookie",
            session_cookie(result.session_token, result.expires_at, settings_for().is_production),
        )
        if key is not None:
            attempts.pop(key, None)
        return response

    @app.post("/api/auth/logout")
    async def logout(request: Request) -> Response:
        token = request.cookies.get(SESSION_COOKIE_NAME)
        if token:
            await auth.logout(token)
        response = _json(200, {"success": True})
        response.headers.append("set-cookie", cleared_cookie())
        return response

    @app.post("/api/auth/reset-password")
    async def reset_password(request: Request) -> Response:
        try:
            body = ResetRequestBody.model_validate(await read_json(request))
        except ValidationError:
            return _json(400, {"error": "A valid email is required."})
        # Always resolves the same way whether or not the email is registered.
        await auth.request_password_reset(body.email)
        return _json(200, {"success": True})

    @app.post("/api/auth/reset-password/confirm")
    async def reset_password_confirm(request: Request) -> Response:
        try:
            body = ResetConfirmBody.model_validate(await read_json(request))
        except ValidationError:
            return _json(
                400,
                {"error": "A reset token and a password of at least 8 characters are required."},
            )
        result = await auth.confirm_password_reset(body.token, body.password)
        if not result.success:
            return _json(400, {"error": result.error or "This reset link is invalid."})
        return _json(200, {"success": True})

    # ---- /api/studio/* -----------------------------------------------------------------------

    @app.get("/api/studio/documents")
    async def list_documents(request: Request) -> Response:
        if (blocked := await studio_gate(request)) is not None:
            return blocked
        documents = await drafts.list()
        return _json(200, {"documents": [d.to_row() for d in documents]})

    @app.post("/api/studio/documents")
    async def save_document(request: Request) -> Response:
        if (blocked := await studio_gate(request)) is not None:
            return blocked
        try:
            draft = DraftBody.model_validate(await read_json(request))
        except ValidationError:
            return _json(400, {"error": "The draft payload is incomplete."})
        payload = draft.model_dump(exclude_none=True)
        fields = dict(payload["fields"])
        title = fields.get("title")
        if _js_falsy(fields.get("slug")) and isinstance(title, str) and js_trim(title):
            fields["slug"] = authoring.slug_from_title(title)
        saved = await authoring.save_draft({**payload, "fields": fields})
        return _json(
            200, {"document": saved["document"].to_row(), "validation": saved["validation"]}
        )

    @app.post("/api/studio/documents/{id}/publish")
    async def publish_document(id: str, request: Request) -> Response:
        if (blocked := await studio_gate(request)) is not None:
            return blocked
        try:
            result = await authoring.publish(id)
            await deps.revalidate()
            return _json(200, {"document": result["document"].to_row(), "report": result["report"]})
        except Exception as error:  # noqa: BLE001 - the TypeScript route turns every failure into 422
            return _json(422, {"error": str(error) or "Publication failed."})

    # ---- /api/authoring/* (new: replaces kernel/authoring.ts) --------------------------------

    @app.get("/api/authoring/definitions")
    async def authoring_definitions(request: Request) -> Response:
        if (blocked := await studio_gate(request)) is not None:
            return blocked
        return _json(200, list_authoring_definitions())

    return app
