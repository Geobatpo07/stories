"""Port of authoring/types.ts: the stored draft document (the canonical Knowledge Object)."""

from dataclasses import dataclass
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict

from schemas.content_type import ContentType
from schemas.zod_strings import Datetime, NonEmpty, Uuid

PublicationState = Literal["draft", "published"]


class Publication(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True)

    kind: ContentType
    slug: NonEmpty
    path: NonEmpty
    publishedAt: Datetime


class AuthoringDocument(BaseModel):
    """What `persistence_records` holds under namespace "knowledge", collection <kind>."""

    model_config = ConfigDict(extra="ignore", strict=True)

    version: Literal[1]
    id: Uuid
    kind: ContentType
    publicationState: PublicationState
    fields: dict[str, Any]
    content: str
    createdAt: Datetime
    updatedAt: Datetime
    # Zod `.optional()`: absent is fine, an explicit null is rejected.
    publication: Publication = None  # type: ignore[assignment]

    def to_row(self) -> dict[str, Any]:
        """JSON value as stored and returned: `publication` is omitted when absent."""
        return self.model_dump(mode="json", exclude_none=True)


@dataclass(frozen=True)
class RenderedDocument:
    format: str
    relative_path: str
    content: str


class KnowledgeRenderer(Protocol):
    format: str

    async def render(self, document: AuthoringDocument) -> RenderedDocument: ...
