"""Port of kernel/pipeline/discovery.ts: list every source file for one registration."""

from pathlib import Path

from ..parsers.parser import Parser
from ..registry.types import EntityRegistration


def discover_source_files(root: Path, registration: EntityRegistration, parser: Parser) -> list[str]:
    return parser.discover(root, registration.content_dir)
