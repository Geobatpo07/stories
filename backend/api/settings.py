"""Environment-derived behaviour, read at request time (the TypeScript code reads `process.env`
live for NODE_ENV and VERCEL, and snapshots the rest at import; tests rely on both).

`NODE_ENV` has no Python equivalent, so the service reads `STORIES_ENV` (`production` /
`development` / `test`). When it is unset the service is `production` on Vercel (`VERCEL` set)
and `development` everywhere else: that default is a deliberate adaptation, not a TypeScript
behaviour, and it is pinned by tests.
"""

from collections.abc import Mapping
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    environ: Mapping[str, str]

    @property
    def is_vercel(self) -> bool:
        """True when the platform sets the client IP header itself (`VERCEL=1`)."""
        return self.environ.get("VERCEL") == "1"

    @property
    def is_production(self) -> bool:
        configured = self.environ.get("STORIES_ENV")
        if configured is not None:
            return configured == "production"
        return bool(self.environ.get("VERCEL"))

    @property
    def studio_enabled(self) -> bool:
        return not self.is_production or self.environ.get("STORIES_STUDIO_ENABLED") == "true"
