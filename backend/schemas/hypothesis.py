"""Port of domain/hypothesis/schema.ts."""

from .common import Slug
from .frontmatter import BaseFrontmatter


class HypothesisFrontmatter(BaseFrontmatter):
    questionSlug: Slug
