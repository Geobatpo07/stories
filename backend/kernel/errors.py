"""Port of kernel/errors.ts.

`KnowledgeValidationError` rebuilds Zod's friendly `{path, message, hint}` issues from a
Pydantic `ValidationError`, so authoring keeps showing the exact same text. The translation is
deliberately table-driven and narrow: it covers every error shape the nine domain schemas can
produce (see fixtures/kernel-contract/validation-issues.json, asserted against the TS output);
an error type it does not know raises instead of silently producing a different message.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from pydantic import ValidationError

from schemas.common import _SLUG_MESSAGE
from schemas.content_status import CONTENT_STATUSES
from schemas.knowledge import KNOWLEDGE_OBJECT_TYPES


class KnowledgeParseError(Exception):
    """A content file could not be read or its raw source could not be parsed (e.g. bad YAML)."""

    def __init__(self, file_path: str, cause: object) -> None:
        self.file_path = file_path
        detail = str(cause) if isinstance(cause, BaseException) else str(cause)
        super().__init__(f'Failed to read or parse "{file_path}": {detail}')


@dataclass(frozen=True)
class ValidationIssue:
    path: str
    message: str
    hint: str

    def to_dict(self) -> dict[str, str]:
        return {"path": self.path, "message": self.message, "hint": self.hint}


_FORMAT_HINT = "check the format (e.g. lowercase kebab-case for a slug, YYYY-MM-DD for a date, a full URL)"


def js_type_name(value: Any) -> str:
    """Zod's `received` vocabulary (ZodParsedType) for a value parsed from YAML/JSON."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, (date, datetime)):
        return "date"
    if isinstance(value, (list, tuple)):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "unknown"


def _enum_expected(options: tuple[str, ...]) -> str:
    return " | ".join(f"'{option}'" for option in options)


def _issues_for(error: dict[str, Any]) -> list[ValidationIssue]:
    path = ".".join(str(part) for part in error["loc"]) or "(root)"
    kind = error["type"]
    received = js_type_name(error.get("input"))

    def invalid_type(expected: str) -> list[ValidationIssue]:
        return [ValidationIssue(path, f"Expected {expected}, received {received}",
                                f"expected {expected}, received {received}")]

    if kind == "missing":
        return [ValidationIssue(path, "Required", "this field is required")]
    if kind == "string_type":
        return invalid_type("string")
    if kind == "list_type":
        return invalid_type("array")
    if kind in ("model_type", "dict_type", "model_attributes_type"):
        return invalid_type("object")
    if kind == "string_too_short":
        minimum = error["ctx"]["min_length"]
        return [ValidationIssue(path, f"String must contain at least {minimum} character(s)",
                                f"must be at least {minimum} character(s)")]
    if kind == "literal_error":
        options = _enum_options(path)
        if not isinstance(error.get("input"), str):
            # Zod's z.enum reports non-strings as invalid_type (expected = the joined options).
            expected = _enum_expected(options)
            return invalid_type(expected)
        return [ValidationIssue(
            path,
            f"Invalid enum value. Expected {_enum_expected(options)}, received '{error['input']}'",
            f"must be one of: {', '.join(options)}",
        )]
    if kind == "slug_empty":
        return [
            ValidationIssue(path, "String must contain at least 1 character(s)",
                            "must be at least 1 character(s)"),
            ValidationIssue(path, _SLUG_MESSAGE, _FORMAT_HINT),
        ]
    if kind == "format":
        return [ValidationIssue(path, error["ctx"]["msg"], _FORMAT_HINT)]
    raise NotImplementedError(f"No Zod-equivalent mapping for Pydantic error type {kind!r} at {path}")


def _enum_options(path: str) -> tuple[str, ...]:
    # Pydantic's literal_error context is a prose string ("'a', 'b' or 'c'"), so the real option
    # order is taken from the schema vocabularies, keyed by the field name.
    leaf = path.split(".")[-1]
    if leaf == "status":
        return CONTENT_STATUSES
    if leaf == "noteType":
        return KNOWLEDGE_OBJECT_TYPES
    raise NotImplementedError(f"No enum vocabulary registered for field {path!r}")


class KnowledgeValidationError(Exception):
    """A content file's frontmatter failed schema validation, with friendly per-field issues."""

    def __init__(self, file_path: str, error: ValidationError) -> None:
        self.file_path = file_path
        self.issues: tuple[ValidationIssue, ...] = tuple(
            issue for item in error.errors(include_url=False, include_context=True)
            for issue in _issues_for(item)
        )
        body = "\n".join(f"  - {i.path}: {i.message} ({i.hint})" for i in self.issues)
        super().__init__(f'Invalid frontmatter in "{file_path}":\n{body}')


class KnowledgeRelationshipError(Exception):
    """A `*Slug`/`*Slugs` frontmatter field points at an entity that does not exist."""

    def __init__(self, source_id: str, field: str, dangling_target_id: str) -> None:
        self.source_id = source_id
        self.field = field
        self.dangling_target_id = dangling_target_id
        super().__init__(
            f'Entity "{source_id}" has a dangling reference in "{field}": '
            f'target "{dangling_target_id}" does not exist.'
        )


class KnowledgeNotFoundError(Exception):
    """`find_by_id` / `find_by_slug` (strict form) found no matching entity."""

    def __init__(self, entity_id: str) -> None:
        self.entity_id = entity_id
        super().__init__(f'No knowledge entity found with id "{entity_id}".')
