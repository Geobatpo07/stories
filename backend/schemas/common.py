"""Port of schemas/common.ts.

Regexes are copied verbatim from the Zod source. Two Python/JS differences are neutralised
deliberately: `re.fullmatch` (so `$` cannot match before a trailing newline, as it can in
Python but not in JS) and `re.ASCII` (so `\\d` is [0-9] only, as in JS).
"""

import re
from typing import Annotated

from pydantic import AfterValidator, AnyUrl, StringConstraints, TypeAdapter, ValidationError
from pydantic_core import PydanticCustomError

_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", re.ASCII)
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$", re.ASCII)


def _format_error(message: str) -> PydanticCustomError:
    # Zod's `invalid_string` issue; the Kernel's error layer reads `ctx.msg` for the text.
    return PydanticCustomError("format", "{msg}", {"msg": message})


def _match(pattern: re.Pattern[str], message: str):
    def check(value: str) -> str:
        if pattern.fullmatch(value) is None:
            raise _format_error(message)
        return value

    return check


NonEmptyStr = Annotated[str, StringConstraints(min_length=1)]

_SLUG_MESSAGE = "Slug must be lowercase kebab-case (e.g. cyclone-modeling)"
_check_slug_format = _match(_SLUG_RE, _SLUG_MESSAGE)


def _slug(value: str) -> str:
    # Zod's `.min(1).regex()` runs BOTH checks, so "" yields two issues (too_small + regex).
    # Pydantic stops at the first failing constraint, so the empty case is one custom error
    # that kernel/errors.py expands back into the two Zod issues.
    if value == "":
        raise PydanticCustomError("slug_empty", "Slug must not be empty")
    return _check_slug_format(value)


Slug = Annotated[str, AfterValidator(_slug)]

IsoDate = Annotated[
    str, AfterValidator(_match(_ISO_DATE_RE, "Date must be in YYYY-MM-DD format"))
]

Tag = NonEmptyStr

_URL = TypeAdapter(AnyUrl)


def _url(value: str) -> str:
    # Zod's .url() runs `new URL(value)` and returns the ORIGINAL string. AnyUrl (Rust `url`
    # crate, also WHATWG) is used only to accept/reject, never to normalise the output.
    try:
        _URL.validate_python(value, strict=True)
    except ValidationError:
        raise _format_error("Invalid url") from None
    return value


Url = Annotated[str, AfterValidator(_url)]
