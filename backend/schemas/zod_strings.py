"""Zod 3.25 string checks used by the Studio (`email`, `uuid`, `datetime`, JS-length `min`).

Regexes are copied from node_modules/zod/v3/types.js. As in schemas/common.py, `fullmatch` and
`re.ASCII` neutralise the two Python/JS differences (`$` before a trailing newline, Unicode `\\d`).
"""

import re
from collections.abc import Callable
from typing import Annotated

from pydantic import AfterValidator
from pydantic_core import PydanticCustomError

_EMAIL = re.compile(
    r"(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}",
    re.IGNORECASE | re.ASCII,
)
_UUID = re.compile(
    r"[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}",
    re.IGNORECASE | re.ASCII,
)
_DATE = (
    r"((\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29"
    r"|\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\d|3[01])|(0[469]|11)-(0[1-9]|[12]\d|30)"
    r"|(02)-(0[1-9]|1\d|2[0-8])))"
)
# z.string().datetime() with no options: UTC `Z` only, seconds optional, any fraction length.
_DATETIME = re.compile(rf"{_DATE}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d+)?)?Z", re.ASCII)


def utf16_length(value: str) -> int:
    """JavaScript `string.length`: UTF-16 code units, so an emoji counts as 2."""
    return len(value.encode("utf-16-le", errors="surrogatepass")) // 2


def _check(pattern: re.Pattern[str], message: str) -> Callable[[str], str]:
    def check(value: str) -> str:
        if pattern.fullmatch(value) is None:
            raise PydanticCustomError("format", "{msg}", {"msg": message})
        return value

    return check


def _min_length(minimum: int) -> Callable[[str], str]:
    def check(value: str) -> str:
        if utf16_length(value) < minimum:
            raise PydanticCustomError(
                "string_too_short", "String must contain at least {n} character(s)", {"n": minimum}
            )
        return value

    return check


Email = Annotated[str, AfterValidator(_check(_EMAIL, "Invalid email"))]
Uuid = Annotated[str, AfterValidator(_check(_UUID, "Invalid uuid"))]
Datetime = Annotated[str, AfterValidator(_check(_DATETIME, "Invalid datetime"))]
NonEmpty = Annotated[str, AfterValidator(_min_length(1))]
MinChars8 = Annotated[str, AfterValidator(_min_length(8))]
