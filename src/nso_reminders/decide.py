from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from nso_reminders.dates import days_until_opening
from nso_reminders.grid import ShopRow
from nso_reminders.send_log import SendLogEntry

_ELIGIBLE = {"Seal Verification", "Pending"}


@dataclass(frozen=True)
class ShopDecision:
    newco_id: str
    action: str
    exception_type: str | None
    description: str
    recommended_action: str
    template_key: str | None
    days_until: int | None
    status: str


def _status_template(status: str) -> str:
    if status == "Seal Verification":
        return "seal_verification"
    return "tamper_check"


def decide_shop(
    shop: ShopRow,
    log: SendLogEntry | None,
    today: date,
    *,
    first_reminder_days: int = 4,
    second_reminder_days: int = 2,
) -> ShopDecision:
    status = (shop.first_tamper_check or "").strip()

    if status == "Completed":
        return ShopDecision(
            shop.newco_id,
            "none",
            None,
            "First Tamper Check is Completed.",
            "No action needed.",
            None,
            days_until_opening(shop.projected_opening, today) if shop.projected_opening else None,
            status,
        )

    if status == "No Devices":
        return ShopDecision(
            shop.newco_id,
            "exception",
            "no_devices",
            "Shop has no devices yet, so First Tamper Check cannot be completed.",
            "Track until devices arrive; do not email for tamper check yet.",
            None,
            days_until_opening(shop.projected_opening, today) if shop.projected_opening else None,
            status,
        )

    if status not in _ELIGIBLE:
        return ShopDecision(
            shop.newco_id,
            "exception",
            "unknown_status",
            f"Unrecognized First Tamper Check status: {status!r}.",
            "Review status in the portal and update the rules if this is a new valid value.",
            None,
            days_until_opening(shop.projected_opening, today) if shop.projected_opening else None,
            status,
        )

    if shop.projected_opening is None:
        return ShopDecision(
            shop.newco_id,
            "exception",
            "blank_opening",
            "Projected Opening date is blank or unreadable.",
            "Fix the opening date in the portal, then re-run.",
            None,
            None,
            status,
        )

    days = days_until_opening(shop.projected_opening, today)
    if days < 0:
        return ShopDecision(
            shop.newco_id,
            "exception",
            "past_opening",
            f"Projected Opening is in the past ({shop.projected_opening.isoformat()}).",
            "Confirm the shop status; no pre-opening reminder will be sent.",
            None,
            days,
            status,
        )

    status_template = _status_template(status)
    sent = log.emails_sent_count if log else 0
    pending = log.pending_draft_message_id if log else None

    if sent >= 2:
        return ShopDecision(
            shop.newco_id,
            "none",
            None,
            "Already sent the maximum of two reminder emails.",
            "No further drafts.",
            None,
            days,
            status,
        )

    if days <= second_reminder_days and pending and sent == 0:
        return ShopDecision(
            shop.newco_id,
            "refresh_draft",
            "stale_draft_refreshed",
            f"Email #1 draft is still unsent and opening is in {days} day(s).",
            "Replace the existing Outlook draft with the urgent refresh wording, then send.",
            "urgent_refresh",
            days,
            status,
        )

    if pending:
        return ShopDecision(
            shop.newco_id,
            "none",
            None,
            "A live draft already exists for this shop; not creating a duplicate.",
            "Review and send the existing Outlook draft.",
            None,
            days,
            status,
        )

    if days <= second_reminder_days and sent == 0 and not pending:
        return ShopDecision(
            shop.newco_id,
            "draft_1",
            "late_catch",
            f"Shop is inside the 2-day window ({days} day(s) out) with no prior reminder sent.",
            "Create and send an urgent first draft immediately.",
            "urgent_refresh",
            days,
            status,
        )

    if days <= first_reminder_days and sent == 0:
        return ShopDecision(
            shop.newco_id,
            "draft_1",
            None,
            f"Shop is {days} day(s) from opening and needs email #1.",
            "Create Outlook draft #1 for approval.",
            status_template,
            days,
            status,
        )

    if days <= second_reminder_days and sent == 1:
        return ShopDecision(
            shop.newco_id,
            "draft_2",
            None,
            f"Shop is {days} day(s) from opening; email #1 was sent and status is still not Completed.",
            "Create Outlook draft #2 for approval.",
            status_template,
            days,
            status,
        )

    return ShopDecision(
        shop.newco_id,
        "none",
        None,
        f"Shop is {days} day(s) from opening; no reminder threshold met yet.",
        "No action today.",
        None,
        days,
        status,
    )
