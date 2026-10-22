"""Port of domain/presentation/schema.ts."""

from .common import NonEmptyStr, Slug, Url
from .frontmatter import BaseFrontmatter


class PresentationFrontmatter(BaseFrontmatter):
    venue: NonEmptyStr = None  # type: ignore[assignment]
    slidesUrl: Url = None  # type: ignore[assignment]
    videoUrl: Url = None  # type: ignore[assignment]
    programSlug: Slug = None  # type: ignore[assignment]
    questionSlug: Slug = None  # type: ignore[assignment]
