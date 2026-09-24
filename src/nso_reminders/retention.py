from __future__ import annotations

from datetime import date

from nso_reminders.dates import parse_mmddyy_from_filename


def should_delete_filename(name: str, today: date, retention_days: int = 14) -> bool:
    lower = name.strip()
    if lower in {"PO_Operator_Email_Cache.xlsx", "PO_Send_Log.xlsx"}:
        return False
    parsed = parse_mmddyy_from_filename(name)
    if parsed is None:
        return False
    age = (today - parsed).days
    return age >= retention_days
