"""Port of domain/program/schema.ts."""

from pydantic import Field

from .common import NonEmptyStr, Slug
from .frontmatter import BaseFrontmatter


class ProgramFrontmatter(BaseFrontmatter):
    theme: NonEmptyStr
    leadResearcher: NonEmptyStr
    relatedQuestionSlugs: list[Slug] = Field(default_factory=list)
