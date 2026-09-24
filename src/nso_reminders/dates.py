from __future__ import annotations

import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

_MMDDYY = re.compile(r"(?:PO_Grid|PO_Reporting_Exceptions)_(\d{2})(\d{2})(\d{2})\.", re.I)


def pacific_today(now: datetime | None = None) -> date:
    tz = ZoneInfo("America/Los_Angeles")
    current = now.astimezone(tz) if now is not None else datetime.now(tz)
    return current.date()


def days_until_opening(opening: date, today: date) -> int:
    return (opening - today).days


def format_po_filename(prefix: str, day: date, ext: str) -> str:
    if not ext.startswith("."):
        ext = f".{ext}"
    return f"{prefix}_{day.strftime('%m%d%y')}{ext}"


def parse_mmddyy_from_filename(name: str) -> date | None:
    m = _MMDDYY.search(name)
    if not m:
        return None
    mm, dd, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return date(2000 + yy, mm, dd)
