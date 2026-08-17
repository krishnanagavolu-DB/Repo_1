from datetime import date

from nso_reminders.retention import should_delete_filename


def test_delete_old_grid_and_report():
    today = date(2026, 8, 17)
    assert should_delete_filename("PO_Grid_080326.xlsx", today, 14) is True
    assert should_delete_filename("PO_Reporting_Exceptions_080326.xlsx", today, 14) is True


def test_keep_recent_and_persistent():
    today = date(2026, 8, 17)
    assert should_delete_filename("PO_Grid_081026.xlsx", today, 14) is False
    assert should_delete_filename("PO_Operator_Email_Cache.xlsx", today, 14) is False
    assert should_delete_filename("PO_Send_Log.xlsx", today, 14) is False
