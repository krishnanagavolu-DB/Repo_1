from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from nso_reminders.config import load_nso_config
from nso_reminders.dates import format_po_filename, pacific_today
from nso_reminders.decide import decide_shop
from nso_reminders.grid import load_projected_openings
from nso_reminders.operators import resolve_from_cache, split_operator_names, load_email_cache
from nso_reminders.report import write_exceptions_report
from nso_reminders.send_log import load_send_log, reconcile_entry, save_send_log
from nso_reminders.templates import render_email


def run_dry_run(
    *,
    grid_path: Path,
    send_log_path: Path,
    cache_path: Path,
    out_dir: Path,
    today: date | None = None,
    config: dict | None = None,
    outlook_states: dict[str, str] | None = None,
) -> dict:
    cfg = config or load_nso_config()
    day = today or pacific_today()
    thresholds = cfg.get("thresholds", {})
    first_days = int(thresholds.get("first_reminder_days", 4))
    second_days = int(thresholds.get("second_reminder_days", 2))
    cc = list(cfg.get("email", {}).get("cc", []))
    templates_dir = Path(cfg.get("email", {}).get("templates_dir", "config/nso-email-templates"))
    if not templates_dir.is_absolute():
        templates_dir = Path(__file__).resolve().parents[2] / templates_dir

    shops = load_projected_openings(grid_path)
    log = load_send_log(send_log_path)
    cache = load_email_cache(cache_path)
    states = outlook_states or {}

    # Reconcile pending drafts first
    for newco, entry in list(log.items()):
        if not entry.pending_draft_message_id:
            continue
        state = states.get(entry.pending_draft_message_id, "in_drafts")
        updated, exc = reconcile_entry(entry, state)
        log[newco] = updated
        # draft_skipped is surfaced on the shop decision pass below via log state

    decisions = []
    draft_previews = []
    report_rows = []

    for shop in shops:
        entry = log.get(shop.newco_id)
        decision = decide_shop(
            shop,
            entry,
            day,
            first_reminder_days=first_days,
            second_reminder_days=second_days,
        )

        names = split_operator_names(shop.franchisee_operator)
        emails, missing = resolve_from_cache(names, cache)

        action = decision.action
        exception_type = decision.exception_type
        description = decision.description
        recommended = decision.recommended_action
        template_key = decision.template_key
        message_id = entry.pending_draft_message_id if entry else ""

        if entry and entry.pending_draft_message_id is None and states:
            # If reconcile cleared a pending draft as missing, note it once
            prior = load_send_log(send_log_path).get(shop.newco_id)
            if prior and prior.pending_draft_message_id and states.get(prior.pending_draft_message_id) == "missing":
                if exception_type is None and action == "none":
                    exception_type = "draft_skipped"
                    description = "Pending draft was deleted before send; shop is eligible again."
                    recommended = "Review and allow a fresh draft on the next eligible run."

        if action in {"draft_1", "draft_2", "refresh_draft"}:
            if missing and not emails:
                action = "exception"
                exception_type = "no_crew_match"
                description = f"No crew email match for: {', '.join(missing)}."
                recommended = "Resolve the operator email in Crew Search or the cache, then re-run."
                template_key = None
            elif missing and emails:
                # Partial success — still draft, but flag unresolved names
                if exception_type is None:
                    exception_type = "no_crew_match"
                description = (
                    f"{description} Unresolved operator(s): {', '.join(missing)}."
                )
                recommended = (
                    f"{recommended} Add missing emails to the cache for: {', '.join(missing)}."
                )

        if action in {"draft_1", "draft_2", "refresh_draft"} and template_key and emails:
            opening = (
                shop.projected_opening.isoformat() if shop.projected_opening else ""
            )
            subject, body = render_email(
                template_key,
                {
                    "newco_id": shop.newco_id,
                    "city": shop.city,
                    "state": shop.state,
                    "operator_names": ", ".join(names) if names else shop.franchisee_operator,
                    "projected_opening": opening,
                    "status": shop.first_tamper_check,
                },
                templates_dir,
            )
            draft_previews.append(
                {
                    "newco_id": shop.newco_id,
                    "to": emails,
                    "cc": cc,
                    "subject": subject,
                    "body": body,
                    "action": action,
                    "template_key": template_key,
                }
            )

        decisions.append(
            {
                "newco_id": shop.newco_id,
                "action": action,
                "exception_type": exception_type,
                "description": description,
                "recommended_action": recommended,
                "template_key": template_key,
                "days_until": decision.days_until,
                "status": decision.status,
                "resolved_emails": emails,
            }
        )
        report_rows.append(
            {
                "NewCo ID": shop.newco_id,
                "Projected Opening": shop.projected_opening.isoformat()
                if shop.projected_opening
                else "",
                "Days Until Opening": decision.days_until
                if decision.days_until is not None
                else "",
                "First Tamper Check": shop.first_tamper_check,
                "Franchisee/Operator": shop.franchisee_operator,
                "Resolved Emails": "; ".join(emails),
                "Action": action,
                "Exception Type": exception_type or "",
                "Description": description,
                "Recommended Action": recommended,
                "Draft / Message ID": message_id or "",
            }
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / format_po_filename("PO_Reporting_Exceptions", day, ".xlsx")
    write_exceptions_report(report_path, report_rows)

    previews_path = out_dir / "draft_previews.json"
    previews_path.write_text(
        json.dumps(draft_previews, indent=2) + "\n", encoding="utf-8"
    )

    reconciled_log_path = out_dir / "PO_Send_Log.reconciled.xlsx"
    save_send_log(reconciled_log_path, log)

    return {
        "decisions": decisions,
        "report_path": report_path,
        "draft_previews": draft_previews,
        "reconciled_log_path": reconciled_log_path,
    }
