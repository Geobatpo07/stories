"""Port of the persistence / email / clock ports in runtime/ports/types.ts."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


class PersistencePort(Protocol):
    async def save(self, collection: str, id: str, value: Any) -> None: ...

    async def load(self, collection: str, id: str) -> Any | None: ...

    async def list(self, collection: str) -> list[Any]: ...

    async def delete(self, collection: str, id: str) -> None: ...


@dataclass(frozen=True)
class EmailMessage:
    to: str
    subject: str
    text: str
    html: str


class EmailPort(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class ClockPort(Protocol):
    def now(self) -> datetime: ...
