"""Port of kernel/pipeline/validation.ts.

Validates raw frontmatter against the registration's model. Never lets a raw Pydantic
`ValidationError` escape: it is always rethrown as a `KnowledgeValidationError`.
Returns the normalised dict (defaults filled, unknown keys stripped, absent optionals omitted).
"""

from typing import Any

from pydantic import ValidationError

from ..errors import KnowledgeValidationError
from ..parsers.parser import ParsedSource
from ..registry.types import EntityRegistration


def validate_frontmatter(parsed: ParsedSource, registration: EntityRegistration) -> dict[str, Any]:
    try:
        return registration.model.parse_frontmatter(parsed.data)
    except ValidationError as error:
        raise KnowledgeValidationError(parsed.source_path, error) from error
