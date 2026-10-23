"""Port of schemas/content-status.ts. Order matches the Zod enum."""

from typing import Literal, get_args

ContentStatus = Literal["draft", "active", "paused", "concluded"]
CONTENT_STATUSES: tuple[str, ...] = get_args(ContentStatus)
