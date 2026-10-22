"""Port of authoring/renderers/mdx-renderer.ts: deterministic MDX from a validated draft.

Output must be byte-identical to the TypeScript renderer, so the JavaScript behaviours it leans on
are reproduced: `JSON.stringify` for strings, `String(value)` for numbers/booleans, and
`String.prototype.trim` (which is NOT Python's `str.strip`).
"""

import json
import re
from typing import Any

from .definitions import get_authoring_definition, validate_authoring_fields
from .types import AuthoringDocument, RenderedDocument

# ECMAScript WhiteSpace + LineTerminator, the characters `trim()` removes.
_JS_WHITESPACE = "\t\n\v\f\r                  　﻿"
_LONE_SURROGATE = re.compile("[\ud800-\udfff]")


def js_trim(value: str) -> str:
    return value.strip(_JS_WHITESPACE)


def _json_string(value: str) -> str:
    encoded = json.dumps(value, ensure_ascii=False)
    # JSON.stringify escapes lone surrogates as \udXXX; Python would emit them raw.
    return _LONE_SURROGATE.sub(lambda m: f"\\u{ord(m.group()):04x}", encoded)


def _js_number(value: int | float) -> str:
    if isinstance(value, float) and value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    return repr(value)


def yaml_value(value: Any) -> str:
    if isinstance(value, list):
        return f"[{', '.join(yaml_value(item) for item in value)}]"
    if isinstance(value, str):
        return _json_string(value)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return _js_number(value)
    if value is None:
        return "null"
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def normalize_body(content: str) -> str:
    normalized = js_trim(re.sub(r"\r\n?", "\n", content))
    return f"{normalized}\n" if normalized else ""


class MDXRenderer:
    format = "mdx"

    async def render(self, document: AuthoringDocument) -> RenderedDocument:
        validation = validate_authoring_fields(document.kind, document.fields)
        if not validation["success"]:
            raise ValueError(
                "; ".join(f"{i['field']}: {i['message']}" for i in validation["issues"])
            )
        data = validation["data"]
        definition = get_authoring_definition(document.kind)
        ordered = [field["name"] for field in definition["fields"]]
        remaining = sorted(name for name in data if name not in ordered)
        frontmatter = "\n".join(
            f"{name}: {yaml_value(data[name])}" for name in [*ordered, *remaining] if name in data
        )
        return RenderedDocument(
            format=self.format,
            relative_path=f"{definition['contentDir']}/{data['slug']}.mdx",
            content=f"---\n{frontmatter}\n---\n\n{normalize_body(document.content)}",
        )
