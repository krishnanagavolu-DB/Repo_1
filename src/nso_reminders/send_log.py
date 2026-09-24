from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import pandas as pd


@dataclass
class SendLogEntry:
    newco_id: str
    projected_opening: date | None
    emails_sent_count: int
    pending_draft_message_id: str | None
    pending_draft_kind: str | None
    last_sent_at: date | None


def reconcile_entry(
    entry: SendLogEntry, outlook_state: str
) -> tuple[SendLogEntry, str | None]:
    if outlook_state == "in_drafts":
        return entry, None
    if outlook_state == "in_sent":
        return (
            SendLogEntry(
                newco_id=entry.newco_id,
                projected_opening=entry.projected_opening,
                emails_sent_count=entry.emails_sent_count + 1,
                pending_draft_message_id=None,
                pending_draft_kind=None,
                last_sent_at=entry.last_sent_at or date.today(),
            ),
            None,
        )
    if outlook_state == "missing":
        return (
            SendLogEntry(
                newco_id=entry.newco_id,
                projected_opening=entry.projected_opening,
                emails_sent_count=entry.emails_sent_count,
                pending_draft_message_id=None,
                pending_draft_kind=None,
                last_sent_at=entry.last_sent_at,
            ),
            "draft_skipped",
        )
    raise ValueError(f"unknown outlook_state: {outlook_state}")


def _as_date(value: object) -> date | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    parsed = pd.to_datetime(value, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def _as_optional_str(value: object) -> str | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    text = str(value).strip()
    return text or None


def load_send_log(path: Path) -> dict[str, SendLogEntry]:
    if not path.exists():
        return {}
    df = pd.read_excel(path)
    if df.empty:
        return {}
    entries: dict[str, SendLogEntry] = {}
    for _, row in df.iterrows():
        newco = str(row["NewCo ID"]).strip()
        entries[newco] = SendLogEntry(
            newco_id=newco,
            projected_opening=_as_date(row.get("Projected Opening")),
            emails_sent_count=int(row.get("Emails Sent Count") or 0),
            pending_draft_message_id=_as_optional_str(row.get("Pending Draft Message ID")),
            pending_draft_kind=_as_optional_str(row.get("Pending Draft Kind")),
            last_sent_at=_as_date(row.get("Last Sent At")),
        )
    return entries


def save_send_log(path: Path, entries: dict[str, SendLogEntry]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for entry in sorted(entries.values(), key=lambda e: e.newco_id):
        rows.append(
            {
                "NewCo ID": entry.newco_id,
                "Projected Opening": entry.projected_opening,
                "Emails Sent Count": entry.emails_sent_count,
                "Pending Draft Message ID": entry.pending_draft_message_id,
                "Pending Draft Kind": entry.pending_draft_kind,
                "Last Sent At": entry.last_sent_at,
            }
        )
    pd.DataFrame(rows).to_excel(path, index=False)
