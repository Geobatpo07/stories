"""Port of runtime/adapters/supabase-persistence-adapter.ts: `PersistencePort` over Supabase's
PostgREST HTTP API with plain `httpx` (no SDK). One generic table, `persistence_records`, keyed by
`namespace` + `collection` + `id`. Same URLs, headers and failure text as the TypeScript adapter,
so rows written here are read unchanged by `middleware.ts`.
"""

import json
from typing import Any
from urllib.parse import quote

import httpx

from .clock import SystemClock, iso_millis

TABLE = "persistence_records"


def _encode(value: str) -> str:
    # encodeURIComponent leaves A-Z a-z 0-9 - _ . ! ~ * ' ( ) unescaped.
    return quote(value, safe="-_.!~*'()")


class SupabasePersistenceAdapter:
    def __init__(
        self,
        url: str,
        service_role_key: str,
        namespace: str,
        client: httpx.AsyncClient | None = None,
    ) -> None:
        # Deliberately no validation, like the TypeScript adapter: construction must not fail
        # for an unconfigured project; failure is lazy, on an actual request.
        self.url = url
        self.namespace = namespace
        self._service_role_key = service_role_key
        self._rest_url = f"{url.removesuffix('/')}/rest/v1/{TABLE}"
        self._client = client

    async def save(self, collection: str, id: str, value: Any) -> None:
        await self._request(
            "POST",
            self._rest_url,
            headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
            body={
                "namespace": self.namespace,
                "collection": collection,
                "id": id,
                "value": value,
                "updated_at": iso_millis(SystemClock().now()),
            },
        )

    async def load(self, collection: str, id: str) -> Any | None:
        rows = await self._request(
            "GET", f"{self._rest_url}?{self._match_params(collection, id)}&select=value"
        )
        return rows[0]["value"] if rows else None

    async def list(self, collection: str) -> list[Any]:
        rows = await self._request(
            "GET",
            f"{self._rest_url}?namespace=eq.{_encode(self.namespace)}"
            f"&collection=eq.{_encode(collection)}&select=value&order=id.asc",
        )
        return [row["value"] for row in rows or []]

    async def delete(self, collection: str, id: str) -> None:
        await self._request("DELETE", f"{self._rest_url}?{self._match_params(collection, id)}")

    def _match_params(self, collection: str, id: str) -> str:
        return (
            f"namespace=eq.{_encode(self.namespace)}&collection=eq.{_encode(collection)}"
            f"&id=eq.{_encode(id)}"
        )

    async def _request(
        self,
        method: str,
        url: str,
        headers: dict[str, str] | None = None,
        body: Any = None,
    ) -> Any:
        merged = {
            "apikey": self._service_role_key,
            "Authorization": f"Bearer {self._service_role_key}",
            "content-type": "application/json",
            **(headers or {}),
        }
        content = (
            None if body is None else json.dumps(body, separators=(",", ":"), ensure_ascii=False)
        )
        if self._client is not None:
            response = await self._client.request(method, url, headers=merged, content=content)
        else:
            async with httpx.AsyncClient() as client:
                response = await client.request(method, url, headers=merged, content=content)
        if not response.is_success:
            raise RuntimeError(
                f"Supabase request failed ({response.status_code} {method} {url}): {response.text}"
            )
        # `return=minimal` yields a 201 with an empty body, so the body, not the status, decides.
        text = response.text
        return json.loads(text) if text else None
