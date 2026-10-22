"""Port of domain/publication/schema.ts."""

from pydantic import Field

from .common import NonEmptyStr, Url
from .frontmatter import BaseFrontmatter


class PublicationFrontmatter(BaseFrontmatter):
    venue: NonEmptyStr = None  # type: ignore[assignment]
    doi: NonEmptyStr = None  # type: ignore[assignment]
    preprintUrl: Url = None  # type: ignore[assignment]
    coAuthors: list[NonEmptyStr] = Field(default_factory=list)
