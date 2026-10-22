"""Port of domain/experiment/schema.ts."""

from .common import Slug
from .frontmatter import BaseFrontmatter


class ExperimentFrontmatter(BaseFrontmatter):
    questionSlug: Slug
    hypothesisSlug: Slug = None  # type: ignore[assignment]
