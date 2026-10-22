"""Port of runtime/adapters/clock.ts, plus the JavaScript `Date` string conventions the stored
rows rely on (`toISOString()` is always `YYYY-MM-DDTHH:mm:ss.sssZ`)."""

import re
from datetime import UTC, datetime, timedelta


class SystemClock:
    def now(self) -> datetime:
        return datetime.now(UTC)


class FixedClock:
    """Deterministic clock for tests; `set` moves it (the TypeScript tests used fake timers)."""

    def __init__(self, fixed: datetime) -> None:
        self._now = fixed

    def now(self) -> datetime:
        return self._now

    def set(self, moment: datetime) -> None:
        self._now = moment

    def advance(self, **delta: float) -> None:
        self._now += timedelta(**delta)


def iso_millis(moment: datetime) -> str:
    """JavaScript `Date.prototype.toISOString()`."""
    utc = moment.astimezone(UTC)
    return f"{utc:%Y-%m-%dT%H:%M:%S}.{utc.microsecond // 1000:03d}Z"


_INSTANT = re.compile(
    r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?Z", re.ASCII
)


def parse_instant(text: str) -> datetime:
    """Parses a string that already passed the Zod-equivalent `datetime` check (UTC, `Z`)."""
    match = _INSTANT.fullmatch(text)
    if match is None:
        raise ValueError(f"Not a UTC ISO datetime: {text!r}")
    year, month, day, hour, minute, second, fraction = match.groups()
    micro = int((fraction or "0").ljust(6, "0")[:6])
    return datetime(
        int(year), int(month), int(day), int(hour), int(minute), int(second or 0), micro, tzinfo=UTC
    )


def epoch_millis(moment: datetime) -> int:
    """JavaScript `getTime()`: whole milliseconds since the epoch."""
    delta = moment.astimezone(UTC) - datetime(1970, 1, 1, tzinfo=UTC)
    return (delta.days * 86_400 + delta.seconds) * 1000 + delta.microseconds // 1000
