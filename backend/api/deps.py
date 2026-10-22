"""Dependency container for the API, and the default (environment-driven) wiring.

Port of the module-scope wiring in `auth/server.ts` and `authoring/server.ts`. Everything that
touches the outside world is a field here so tests can swap it: the two Supabase namespaces, the
email sender, the clock, the publication target (stubbed) and the site-revalidation hook (stubbed).
"""

import os
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass, field

from authoring.workflow import PublicationTarget, UnimplementedPublicationTarget
from runtime.clock import SystemClock
from runtime.ports import ClockPort, EmailPort, PersistencePort
from runtime.resend import ResendEmailAdapter
from runtime.supabase import SupabasePersistenceAdapter


async def revalidate_site() -> None:
    # TODO(ADR-004 phase 4, next step): call the Next.js revalidate endpoint (the TypeScript route
    # called revalidatePath("/", "layout") plus resetRuntimeContext / resetLaboratory).
    raise NotImplementedError("Site revalidation is not implemented in the Python service yet.")


@dataclass
class AppDependencies:
    environ: Mapping[str, str]
    auth_persistence: PersistencePort
    knowledge_persistence: PersistencePort
    email: EmailPort
    clock: ClockPort = field(default_factory=SystemClock)
    publication: PublicationTarget = field(default_factory=UnimplementedPublicationTarget)
    revalidate: Callable[[], Awaitable[None]] = revalidate_site


def _get(environ: Mapping[str, str], key: str, default: str) -> str:
    # `configuration.get(key) ?? default`: only a missing key falls back, an empty string stays.
    value = environ.get(key)
    return default if value is None else value


def reset_url_base(environ: Mapping[str, str]) -> str:
    site_url = _get(environ, "NEXT_PUBLIC_SITE_URL", "http://localhost:3000")
    return f"{site_url.removesuffix('/')}/studio/reset-password"


def build_default_dependencies(environ: Mapping[str, str] | None = None) -> AppDependencies:
    env = os.environ if environ is None else environ
    url = _get(env, "SUPABASE_URL", "")
    key = _get(env, "SUPABASE_SERVICE_ROLE_KEY", "")
    return AppDependencies(
        environ=env,
        auth_persistence=SupabasePersistenceAdapter(url, key, "auth"),
        knowledge_persistence=SupabasePersistenceAdapter(url, key, "knowledge"),
        email=ResendEmailAdapter(
            _get(env, "RESEND_API_KEY", ""),
            _get(env, "STUDIO_ADMIN_RESET_FROM_EMAIL", "onboarding@resend.dev"),
        ),
    )
