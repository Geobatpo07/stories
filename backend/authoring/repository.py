"""Port of authoring/repository.ts: drafts live under namespace "knowledge", collection = kind."""

import asyncio
from collections.abc import Sequence

from kernel.registry.registrations import REGISTRATIONS
from runtime.ports import PersistencePort

from .types import AuthoringDocument


def _locale_key(value: str) -> tuple[str, str]:
    # JavaScript `localeCompare` (ICU): primary order ignores case, lowercase wins a tie. Exact for
    # the hex/digit/hyphen alphabet of a UUID and for ISO timestamps, the only values compared.
    return value.lower(), value.swapcase()


class KnowledgeObjectRepository:
    def __init__(self, persistence: PersistencePort) -> None:
        self._persistence = persistence

    async def save(self, document: AuthoringDocument) -> None:
        validated = AuthoringDocument.model_validate(document.to_row())
        await self._persistence.save(validated.kind, validated.id, validated.to_row())

    async def get(self, kind: str, id: str) -> AuthoringDocument | None:
        value = await self._persistence.load(kind, id)
        return None if value is None else AuthoringDocument.model_validate(value)

    async def find(self, id: str) -> AuthoringDocument | None:
        for registration in REGISTRATIONS:
            document = await self.get(registration.kind, id)
            if document is not None:
                return document
        return None

    async def list(self, kind: str | None = None) -> list[AuthoringDocument]:
        kinds: Sequence[str] = [kind] if kind else [r.kind for r in REGISTRATIONS]

        async def of_kind(item: str) -> list[AuthoringDocument]:
            values = await self._persistence.list(item)
            return [AuthoringDocument.model_validate(value) for value in values]

        collections = await asyncio.gather(*(of_kind(item) for item in kinds))
        documents = [document for collection in collections for document in collection]
        # Newest updatedAt first, ties broken by id.
        documents.sort(key=lambda d: _locale_key(d.id))
        documents.sort(key=lambda d: _locale_key(d.updatedAt), reverse=True)
        return documents

    async def delete(self, document: AuthoringDocument) -> None:
        await self._persistence.delete(document.kind, document.id)
