from datetime import date, datetime
from zoneinfo import ZoneInfo

from nso_reminders.dates import (
    days_until_opening,
    format_po_filename,
    pacific_today,
    parse_mmddyy_from_filename,
)


def test_pacific_today_uses_los_angeles():
    # 2026-08-18 01:30 UTC == 2026-08-17 evening Pacific
    now = datetime(2026, 8, 18, 1, 30, tzinfo=ZoneInfo("UTC"))
    assert pacific_today(now) == date(2026, 8, 17)


def test_days_until_opening_calendar_days():
    assert days_until_opening(date(2026, 8, 21), date(2026, 8, 17)) == 4
    assert days_until_opening(date(2026, 8, 17), date(2026, 8, 17)) == 0
    assert days_until_opening(date(2026, 8, 16), date(2026, 8, 17)) == -1


def test_filename_roundtrip():
    assert format_po_filename("PO_Grid", date(2026, 8, 17), ".xlsx") == "PO_Grid_081726.xlsx"
    assert format_po_filename("PO_Reporting_Exceptions", date(2026, 8, 17), ".xlsx") == (
        "PO_Reporting_Exceptions_081726.xlsx"
    )
    assert parse_mmddyy_from_filename("PO_Grid_081726.xlsx") == date(2026, 8, 17)
    assert parse_mmddyy_from_filename("PO_Operator_Email_Cache.xlsx") is None
