"""Port of kernel/parsers/parser.ts: the source-type abstraction."""

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class ParsedSource:
    """A source discovered but not yet validated: frontmatter is raw, untyped data."""

    slug: str
    data: Any
    content: str
    source_path: str  # root-relative, '/'-separated


class Parser(Protocol):
    def discover(self, root: Path, collection_dir: str) -> list[str]:
        """List root-relative source paths under a collection directory. No parsing."""

    def parse(self, root: Path, source_path: str) -> ParsedSource:
        """Read and split one source into raw, unvalidated frontmatter + body."""
