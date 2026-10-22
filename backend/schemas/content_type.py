"""Port of schemas/content-type.ts. Canonical entity-kind vocabulary; order matches Zod."""

from typing import Literal, get_args

ContentType = Literal[
    "program",
    "question",
    "hypothesis",
    "note",
    "experiment",
    "software",
    "publication",
    "dataset",
    "presentation",
]
CONTENT_TYPES: tuple[str, ...] = get_args(ContentType)
