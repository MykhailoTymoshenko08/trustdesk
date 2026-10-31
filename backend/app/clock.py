"""single source of 'now' (naive utc). demo mode: fixed anchor that advances with the process clock,
so seed numbers are reproducible but new tickets get distinct timestamps"""
import time
from datetime import datetime, timedelta, timezone

from app.config import get_settings

_START = time.monotonic()


def now() -> datetime:
    fixed = get_settings().demo_now
    if fixed:
        return datetime.fromisoformat(fixed) + timedelta(seconds=int(time.monotonic() - _START))
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
