"""The Python string validators used by the Studio bodies and stored rows (schemas/zod_strings.py)
must accept and reject exactly what zod 3.25 does. fixtures/auth-contract/zod-string-checks.json
was produced by the real zod (backend/tools/zod-string-cases.mjs)."""

import json
from pathlib import Path

import pytest
from pydantic import TypeAdapter, ValidationError

from schemas.zod_strings import Datetime, Email, MinChars8, NonEmpty, Uuid

GOLDEN = json.loads(
    (
        Path(__file__).resolve().parents[2] / "fixtures/auth-contract/zod-string-checks.json"
    ).read_text("utf8")
)
VALIDATORS = {
    "email": Email,
    "datetime": Datetime,
    "uuid": Uuid,
    "min1": NonEmpty,
    "min8": MinChars8,
}

CASES = [(name, case["value"], case["ok"]) for name, cases in GOLDEN.items() for case in cases]


@pytest.mark.parametrize(
    ("check", "value", "zod_accepts"), CASES, ids=[f"{c[0]}:{c[1]!r}"[:70] for c in CASES]
)
def test_accepts_and_rejects_exactly_like_zod(check, value, zod_accepts):
    try:
        TypeAdapter(VALIDATORS[check]).validate_python(value)
        accepted = True
    except ValidationError:
        accepted = False
    assert accepted == zod_accepts
