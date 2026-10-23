"""Port of domain/question/schema.ts."""

from .common import Slug
from .frontmatter import BaseFrontmatter


class QuestionFrontmatter(BaseFrontmatter):
    programSlug: Slug
