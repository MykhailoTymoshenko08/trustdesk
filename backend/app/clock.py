"""single source of 'now' (naive utc) so demo numbers are reproducible"""
from datetime import datetime, timezone

from app.config import get_settings


def now() -> datetime:
    fixed = get_settings().demo_now
    if fixed:
        return datetime.fromisoformat(fixed)
    return datetime.now(timezone.utc).replace(tzinfo=None, microsecond=0)
