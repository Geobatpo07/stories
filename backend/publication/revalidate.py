"""Service-to-service call to the Next.js revalidation route (`app/api/internal/revalidate`).

Python cannot call `revalidatePath` itself. The shared secret goes in the `x-revalidate-secret`
header and lives in the `REVALIDATE_SECRET` environment variable on BOTH sides (like
`SUPABASE_SERVICE_ROLE_KEY`); the Next route compares it in constant time.
"""

import httpx

PATH = "/api/internal/revalidate"
HEADER = "x-revalidate-secret"


class NextRevalidator:
    def __init__(self, base_url: str, secret: str, client: httpx.AsyncClient | None = None) -> None:
        self._url = f"{base_url.removesuffix('/')}{PATH}"
        self._secret = secret
        self._client = client

    async def __call__(self) -> None:
        if not self._secret:
            raise RuntimeError("REVALIDATE_SECRET is not set, so the site cannot be revalidated.")
        headers = {HEADER: self._secret}
        if self._client is not None:
            response = await self._client.post(self._url, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(self._url, headers=headers)
        if not response.is_success:
            raise RuntimeError(
                f"Revalidation was refused ({response.status_code}): {response.text[:200]}"
            )
