from datetime import date

from nso_reminders.send_log import SendLogEntry, reconcile_entry


def test_in_drafts_unchanged():
    e = SendLogEntry("CA2908", date(2026, 8, 21), 0, "msg-1", "1", None)
    updated, exc = reconcile_entry(e, "in_drafts")
    assert updated.pending_draft_message_id == "msg-1"
    assert updated.emails_sent_count == 0
    assert exc is None


def test_in_sent_increments_and_clears_pending():
    e = SendLogEntry("CA2908", date(2026, 8, 21), 0, "msg-1", "1", None)
    updated, exc = reconcile_entry(e, "in_sent")
    assert updated.emails_sent_count == 1
    assert updated.pending_draft_message_id is None
    assert updated.pending_draft_kind is None
    assert exc is None


def test_missing_clears_pending_and_flags_skipped():
    e = SendLogEntry("CA2908", date(2026, 8, 21), 0, "msg-1", "1", None)
    updated, exc = reconcile_entry(e, "missing")
    assert updated.pending_draft_message_id is None
    assert updated.emails_sent_count == 0
    assert exc == "draft_skipped"
