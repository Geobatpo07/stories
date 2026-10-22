"""Port of kernel/pipeline/parsing.ts: read one source into raw, unvalidated frontmatter + body."""

from pathlib import Path

from ..parsers.parser import ParsedSource, Parser


def parse_source(root: Path, source_path: str, parser: Parser) -> ParsedSource:
    return parser.parse(root, source_path)
