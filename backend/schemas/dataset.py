"""Port of domain/dataset/schema.ts."""

from .common import NonEmptyStr, Url
from .frontmatter import BaseFrontmatter


class DatasetFrontmatter(BaseFrontmatter):
    sourceUrl: Url = None  # type: ignore[assignment]
    license: NonEmptyStr = None  # type: ignore[assignment]
