"""Port of domain/software/schema.ts."""

from .common import NonEmptyStr, Url
from .frontmatter import BaseFrontmatter


class SoftwareFrontmatter(BaseFrontmatter):
    repositoryUrl: Url = None  # type: ignore[assignment]
    license: NonEmptyStr = None  # type: ignore[assignment]
