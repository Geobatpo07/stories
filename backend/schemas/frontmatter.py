"""Port of schemas/frontmatter.ts.

Unknown-field behaviour: Zod's `z.object()` defaults to "strip" and no domain schema uses
`.strict()` / `.passthrough()`, so every model is `extra="ignore"` (unknown keys dropped from
the output, never an error). `strict=True` mirrors Zod's no-coercion `z.string()` / `z.array()`.

Optional fields: Zod `.optional()` accepts a missing key but REJECTS an explicit `null`. They
are therefore declared `T = None` (the default is not validated, but an explicit None input
is) rather than `T | None`, and dumped with `exclude_none=True` by `parse_frontmatter`.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from .common import IsoDate, NonEmptyStr, Slug, Tag
from .content_status import ContentStatus


class BaseFrontmatter(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    title: NonEmptyStr
    slug: Slug
    description: NonEmptyStr
    date: IsoDate
    status: ContentStatus = "draft"
    tags: list[Tag] = Field(default_factory=list)

    @classmethod
    def parse_frontmatter(cls, data: Any) -> dict[str, Any]:
        """Validate and return the normalised dict (defaults filled, unknowns stripped)."""
        return cls.model_validate(data).model_dump(exclude_none=True)
