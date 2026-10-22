"""Port of kernel/authoring.ts: the single source of truth for the Studio's field definitions.

`kernel/authoring.ts` derives them by introspecting each Zod schema; here they are derived from
the Pydantic models (`schemas/`). The committed fixtures in `fixtures/authoring-contract/` were
produced by the TypeScript implementation, and `tests/test_authoring_contract.py` asserts that
this module reproduces them exactly (9 kinds, 4 validation cases). From now on Python owns the
definitions and the TypeScript copy is only a frozen reference.
"""

import re
from collections.abc import Sequence
from types import UnionType
from typing import Annotated, Any, Literal, Union, cast, get_args, get_origin

from pydantic import ValidationError
from pydantic.fields import FieldInfo
from pydantic_core import PydanticUndefined

from kernel.errors import _issues_for
from kernel.parsers.parser import ParsedSource
from kernel.pipeline.factory import create_entity
from kernel.pipeline.normalization import normalize_frontmatter
from kernel.pipeline.relationships import resolve_relationships
from kernel.registry.registrations import REGISTRATIONS
from kernel.registry.types import EntityRegistration
from kernel.types import KnowledgeEntity
from schemas.common import _url

JsonObject = dict[str, Any]

_PUBLIC_KINDS = {
    "program": "Program",
    "question": "Project",
    "note": "Story",
    "hypothesis": "Investigation",
    "experiment": "Investigation",
}

_URL_TEXT = "Enter a complete web address, including https://."
_REQUIRED_TEXT = "This field is required."
_ENUM_TEXT = "Choose one of the available values."


def _humanize(value: str) -> str:
    spaced = re.sub(r"([a-z])([A-Z])", r"\1 \2", value)
    spaced = re.sub(r"[-_]", " ", spaced)
    return spaced[:1].upper() + spaced[1:]


def _public_kind(kind: str) -> str:
    return _PUBLIC_KINDS.get(kind, "Artifact")


def _unwrap_optional(annotation: Any) -> Any:
    if get_origin(annotation) in (Union, UnionType):
        members = [arg for arg in get_args(annotation) if arg is not type(None)]
        if len(members) == 1:
            return members[0]
    return annotation


def _element(annotation: Any) -> tuple[bool, Any, Sequence[Any]]:
    """Returns (is_array, value annotation, validator metadata of the value type)."""
    annotation = _unwrap_optional(annotation)
    is_array = get_origin(annotation) is list
    value = get_args(annotation)[0] if is_array else annotation
    metadata: Sequence[Any] = ()
    if get_origin(value) is Annotated:
        metadata = value.__metadata__
        value = get_args(value)[0]
    return is_array, value, metadata


def _is_url(field: FieldInfo, element_metadata: Sequence[Any], is_array: bool) -> bool:
    metadata = element_metadata if is_array else field.metadata
    return any(getattr(item, "func", None) is _url for item in metadata)


def _fields_for(registration: EntityRegistration) -> list[JsonObject]:
    fields: list[JsonObject] = []
    for name, field in registration.model.model_fields.items():
        relationship = next((r for r in registration.relationship_fields if r.field == name), None)
        is_array, value, element_metadata = _element(field.annotation)
        options = list(get_args(value)) if get_origin(value) is Literal else None
        if relationship:
            field_type = "relationship"
        elif name == "description":
            field_type = "textarea"
        elif name == "tags":
            field_type = "tags"
        elif name == "date":
            field_type = "date"
        elif options:
            field_type = "select"
        elif is_array:
            field_type = "string-list"
        elif _is_url(field, element_metadata, is_array) or name.lower().endswith("url"):
            field_type = "url"
        else:
            field_type = "text"

        definition: JsonObject = {
            "name": name,
            "label": _humanize(name),
            "type": field_type,
            "required": field.is_required(),
            "multiple": is_array,
        }
        if options:
            definition["options"] = options
        if relationship:
            definition["relationshipKind"] = relationship.target_kind
        if not field.is_required():
            default = field.get_default(call_default_factory=True)
            if default is not PydanticUndefined and default is not None:
                definition["defaultValue"] = default
        fields.append(definition)
    return fields


def list_authoring_definitions() -> list[JsonObject]:
    return [
        {
            "kind": registration.kind,
            "label": _humanize(registration.kind),
            "publicKind": _public_kind(registration.kind),
            "contentDir": registration.content_dir,
            "fields": _fields_for(registration),
        }
        for registration in REGISTRATIONS
    ]


def get_authoring_definition(kind: str) -> JsonObject:
    for definition in list_authoring_definitions():
        if definition["kind"] == kind:
            return definition
    raise ValueError(f"Unknown knowledge kind: {kind}")


def _friendly_issues(error: ValidationError) -> list[JsonObject]:
    """Zod's `friendlyMessage`, applied to the Pydantic errors."""
    issues: list[JsonObject] = []
    for item in error.errors(include_url=False, include_context=True):
        field = ".".join(str(part) for part in item["loc"]) or "document"
        kind = item["type"]
        if kind == "missing":
            messages = [_REQUIRED_TEXT]
        elif kind == "format" and item["ctx"]["msg"] == "Invalid url":
            messages = [_URL_TEXT]
        elif kind == "literal_error" and isinstance(item.get("input"), str):
            messages = [_ENUM_TEXT]
        else:
            messages = [
                re.sub(r"^String", "This value", i.message)
                for i in _issues_for(cast(dict[str, Any], item))
            ]
        issues.extend({"field": field, "message": message} for message in messages)
    return issues


def validate_authoring_fields(kind: str, fields: JsonObject) -> JsonObject:
    registration = next((r for r in REGISTRATIONS if r.kind == kind), None)
    if registration is None:
        return {
            "success": False,
            "issues": [{"field": "kind", "message": "Choose a valid knowledge type."}],
        }
    try:
        data = registration.model.parse_frontmatter(fields)
    except ValidationError as error:
        return {"success": False, "issues": _friendly_issues(error)}
    return {"success": True, "data": normalize_frontmatter(data), "issues": []}


def materialize_authoring_objects(objects: Sequence[JsonObject]) -> list[KnowledgeEntity]:
    """Validates and resolves a set of drafts as the Kernel would (closed-world relationships).

    Raises on any problem, like the TypeScript function. The TypeScript version also builds the
    knowledge graph; nothing here reads it, so that step is not ported.
    """
    entities: list[KnowledgeEntity] = []
    for item in objects:
        registration = next((r for r in REGISTRATIONS if r.kind == item["kind"]), None)
        if registration is None:
            raise ValueError(f"Unknown knowledge kind: {item['kind']}")
        validation = validate_authoring_fields(item["kind"], item["fields"])
        if not validation["success"]:
            raise ValueError(
                "; ".join(f"{i['field']}: {i['message']}" for i in validation["issues"])
            )
        data = validation["data"]
        slug = str(data["slug"])
        parsed = ParsedSource(
            slug=slug,
            data=data,
            content=item["content"],
            source_path=f"knowledge/{item['kind']}/{slug}.json",
        )
        entities.append(create_entity(registration, parsed, data))
    return resolve_relationships(entities, REGISTRATIONS)
