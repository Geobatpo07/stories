"""Port of kernel/pipeline/normalization.ts: today this only dedupes and sorts `tags`."""

from typing import Any


def _utf16_key(value: str) -> bytes:
    # JavaScript's default Array.prototype.sort() compares UTF-16 code units, which differs from
    # Python's code-point order for characters outside the BMP.
    return value.encode("utf-16-be", errors="surrogatepass")


def normalize_frontmatter(frontmatter: dict[str, Any]) -> dict[str, Any]:
    return {**frontmatter, "tags": sorted(set(frontmatter["tags"]), key=_utf16_key)}
