from datetime import date

from nso_reminders.decide import decide_shop
from nso_reminders.grid import ShopRow
from nso_reminders.send_log import SendLogEntry


def _shop(status, opening, newco="CA2908"):
    return ShopRow(newco, opening, status, "Codi Crain", "Fresno", "CA")


def test_completed_noop():
    d = decide_shop(_shop("Completed", date(2026, 8, 21)), None, date(2026, 8, 17))
    assert d.action == "none"


def test_no_devices_exception():
    d = decide_shop(_shop("No Devices", date(2026, 8, 21)), None, date(2026, 8, 17))
    assert d.action == "exception"
    assert d.exception_type == "no_devices"


def test_pending_at_5_days_noop():
    d = decide_shop(_shop("Pending", date(2026, 8, 22)), None, date(2026, 8, 17))
    assert d.action == "none"


def test_pending_at_4_days_draft_1():
    d = decide_shop(_shop("Pending", date(2026, 8, 21)), None, date(2026, 8, 17))
    assert d.action == "draft_1"
    assert d.template_key == "tamper_check"


def test_seal_verification_template():
    d = decide_shop(_shop("Seal Verification", date(2026, 8, 21)), None, date(2026, 8, 17))
    assert d.action == "draft_1"
    assert d.template_key == "seal_verification"


def test_draft_2_when_first_sent():
    log = SendLogEntry("CA2908", date(2026, 8, 19), 1, None, None, date(2026, 8, 15))
    d = decide_shop(_shop("Pending", date(2026, 8, 19)), log, date(2026, 8, 17))
    assert d.action == "draft_2"


def test_refresh_when_unsent_at_two_days():
    log = SendLogEntry("CA2908", date(2026, 8, 19), 0, "msg-1", "1", None)
    d = decide_shop(_shop("Pending", date(2026, 8, 19)), log, date(2026, 8, 17))
    assert d.action == "refresh_draft"
    assert d.template_key == "urgent_refresh"
    assert d.exception_type == "stale_draft_refreshed"


def test_late_catch_inside_two_days():
    d = decide_shop(_shop("Pending", date(2026, 8, 18)), None, date(2026, 8, 17))
    assert d.action == "draft_1"
    assert d.template_key == "urgent_refresh"
    assert d.exception_type == "late_catch"


def test_blank_opening_exception():
    d = decide_shop(_shop("Pending", None), None, date(2026, 8, 17))
    assert d.action == "exception"
    assert d.exception_type == "blank_opening"
