"""Port of kernel/parsers/markdown-parser.ts, including the `gray-matter` splitting rules.

`gray-matter` 4.0.3 (what the TS Kernel uses) has a few behaviours that are easy to get subtly
wrong, so `split_frontmatter` mirrors its algorithm step by step instead of using a Python
frontmatter library:

- the opening `---` must be the very first characters (a UTF-8 BOM is stripped first), and
  `----` is not an opening delimiter;
- text on the opening line is a "language" (`---json`, `---yaml`); an unknown one is an error;
- the closing delimiter is the first `\\n---` anywhere (so `\\n----` and `\\n---x` also close it);
- with no closing delimiter the WHOLE remainder is frontmatter and the body is empty;
- a comment-only / blank frontmatter block, or one that parses to null (`~`), is `{}`;
- one `\\r` and one `\\n` after the closing delimiter are dropped from the body.

`trim()` uses JavaScript's whitespace set, not Python's (they differ, e.g. U+FEFF and U+0085).
"""

import io
import json
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from ruamel.yaml import YAML

from ..errors import KnowledgeParseError
from .parser import ParsedSource

_EXTENSIONS = (".mdx", ".md")
_OPEN = "---"
_CLOSE = "\n---"

# ECMAScript WhiteSpace + LineTerminator (what String.prototype.trim and \s use).
_JS_WS = "\t\n\v\f\r                  　﻿"
_COMMENT_LINE = re.compile(rf"^[{re.escape(_JS_WS)}]*#[^\n]+", re.MULTILINE)


def js_trim(value: str) -> str:
    return value.strip(_JS_WS)


def _parse_yaml(text: str) -> Any:
    yaml = YAML(typ="safe", pure=True)
    yaml.allow_duplicate_keys = False
    return yaml.load(io.StringIO(text))


def _engine(language: str) -> Callable[[str], Any]:
    name = language.lower()
    if name in ("yaml", "yml"):
        return _parse_yaml
    if name == "json":
        return json.loads
    # gray-matter also ships `javascript` (eval) and `coffee`; neither is supported here by design.
    raise ValueError(f'gray-matter engine "{language}" is not registered')


def split_frontmatter(raw: str) -> tuple[Any, str]:
    """Return `(data, body)` exactly as `matter(raw)` would, before the caller's `.trim()`."""
    if raw == "":
        return {}, raw
    text = raw.removeprefix("﻿")
    if not text.startswith(_OPEN):
        return {}, text
    if text[len(_OPEN) : len(_OPEN) + 1] == _OPEN[-1]:
        return {}, text

    rest = text[len(_OPEN) :]
    length = len(rest)

    # matter.language(): everything up to the first newline; `search` == -1 slices off the last char.
    newline = re.search(r"\r?\n", rest)
    end = newline.start() if newline else -1
    language_raw = rest[:end] if end != -1 else rest[:-1]
    language = js_trim(language_raw)
    lang = "yaml"
    if language:
        lang = language
        rest = rest[len(language_raw) :]

    close_index = rest.find(_CLOSE)
    if close_index == -1:
        close_index = length
    matter_block = rest[:close_index]

    if js_trim(_COMMENT_LINE.sub("", matter_block)) == "":
        data: Any = {}
    else:
        data = _engine(lang)(matter_block)

    if data is None:
        # gray-matter's excerpt() step replaces a null/undefined result (`~`, `null`) with {}.
        data = {}

    if close_index == length:
        return data, ""
    body = rest[close_index + len(_CLOSE) :]
    if body[:1] == "\r":
        body = body[1:]
    if body[:1] == "\n":
        body = body[1:]
    return data, body


def extract_slug(data: Any, source_path: str) -> str:
    """Port of lib/markdown's `extractSlug`: frontmatter slug, else the filename without .md/.mdx."""
    slug = data.get("slug") if isinstance(data, dict) else None
    if isinstance(slug, str):
        return slug
    return re.sub(r"\.mdx?$", "", source_path.rsplit("/", 1)[-1])


class MarkdownParser:
    def discover(self, root: Path, collection_dir: str) -> list[str]:
        try:
            names = sorted(p.name for p in (root / collection_dir).iterdir())
        except OSError as cause:
            raise KnowledgeParseError(collection_dir, cause) from cause
        return [f"{collection_dir}/{name}" for name in names if name.endswith(_EXTENSIONS)]

    def parse(self, root: Path, source_path: str) -> ParsedSource:
        try:
            raw = (root / source_path).read_bytes().decode("utf-8", errors="replace")
            data, body = split_frontmatter(raw)
            return ParsedSource(extract_slug(data, source_path), data, js_trim(body), source_path)
        except Exception as cause:
            raise KnowledgeParseError(source_path, cause) from cause
