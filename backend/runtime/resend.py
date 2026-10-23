"""Port of runtime/adapters/resend-email-adapter.ts: one JSON POST to Resend's HTTP API."""

import json

import httpx

from .ports import EmailMessage

RESEND_ENDPOINT = "https://api.resend.com/emails"


class ResendEmailAdapter:
    def __init__(
        self, api_key: str, from_address: str, client: httpx.AsyncClient | None = None
    ) -> None:
        self.api_key = api_key
        self.from_address = from_address
        self._client = client

    async def send(self, message: EmailMessage) -> None:
        headers = {"Authorization": f"Bearer {self.api_key}", "content-type": "application/json"}
        content = json.dumps(
            {
                "from": self.from_address,
                "to": [message.to],
                "subject": message.subject,
                "text": message.text,
                "html": message.html,
            },
            separators=(",", ":"),
            ensure_ascii=False,
        )
        if self._client is not None:
            response = await self._client.post(RESEND_ENDPOINT, headers=headers, content=content)
        else:
            async with httpx.AsyncClient() as client:
                response = await client.post(RESEND_ENDPOINT, headers=headers, content=content)
        if not response.is_success:
            raise RuntimeError(
                f"Resend rejected the email ({response.status_code}): {response.text}"
            )
