# NSO First Tamper Check Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a tested daily decision engine that turns a Projected Openings grid + send-log into Outlook draft actions and a SharePoint exceptions report, plus the Cursor Automation runbook that drives portal / Outlook web / SharePoint with a saved personal browser session.

**Architecture:** Pure Python package `nso_reminders` decides per-shop actions offline (parse grid → apply rules → render templates → write exceptions workbook). A daily Cursor Automation (cloud, saved session) performs browser steps and calls `scripts/run_nso_reminders.py --dry-run` / live hooks. No Microsoft Graph. Worldpay dashboard code stays untouched.

**Tech Stack:** Python 3.12, pandas, openpyxl, pytest; editable Markdown email templates; Cursor Automation + browser session for portal / Outlook web / SharePoint.

**Spec:** `docs/superpowers/specs/2026-08-17-nso-tamper-check-reminders-design.md`

## Global Constraints

- v1 creates **Outlook drafts only** — never auto-send
- Portal + Outlook + SharePoint via **browser UI only** (no Graph / Azure app / IT service account)
- On session expiry: **stop the run**, ask for re-login; do not invent alternate drop locations
- Clock: calendar days in **America/Los_Angeles**
- Opening date column: **Projected Opening** (not Turnover); shop key: **NewCo ID**
- Status flow: Seal Verification → Pending → Completed; only **Completed** stops emails
- **No Devices** / unknown status → exception only (no email)
- Timing: email #1 at ≤4 days; email #2 at ≤2 days; catch-up safe
- Stale unsent #1 at ≤2 days → **replace** with one urgent draft (still counts as #1 when sent)
- Multi-operator: split on commas; one draft, all resolved emails in TO
- Crew match: exact 1:1 only; never guess
- Sent = found in Sent Items (not draft creation)
- SharePoint filenames: `PO_Grid_MMDDYY.*`, `PO_Reporting_Exceptions_MMDDYY.xlsx`
- Retention: delete automation files **≥ 14 calendar days** old; keep `PO_Operator_Email_Cache.xlsx` and `PO_Send_Log.xlsx` forever
- Do not modify `src/worldpay_dashboard/` or leadership `site/` for this work

## File structure

| Path | Responsibility |
|---|---|
| `config/nso-source.json` | SharePoint paths, URLs, thresholds, CC list placeholder |
| `config/nso-email-templates/seal_verification.md` | Editable draft copy (step 1) |
| `config/nso-email-templates/tamper_check.md` | Editable draft copy (Pending / step 2) |
| `config/nso-email-templates/urgent_refresh.md` | Editable copy for refresh / late-catch |
| `src/nso_reminders/__init__.py` | Package marker |
| `src/nso_reminders/config.py` | Load `nso-source.json` |
| `src/nso_reminders/dates.py` | Pacific "today", days-until-opening, MMDDYY filenames |
| `src/nso_reminders/grid.py` | Flexible column match + normalize rows |
| `src/nso_reminders/operators.py` | Split operator names; cache load/save helpers |
| `src/nso_reminders/send_log.py` | Load/save send-log; reconcile draft states |
| `src/nso_reminders/decide.py` | Per-shop action decision |
| `src/nso_reminders/templates.py` | Render subject/body from Markdown templates |
| `src/nso_reminders/report.py` | Write `PO_Reporting_Exceptions_MMDDYY.xlsx` |
| `src/nso_reminders/retention.py` | Which filenames are deletable at ≥14 days |
| `src/nso_reminders/pipeline.py` | Dry-run orchestration: grid + log + cache → decisions + report + draft previews |
| `scripts/run_nso_reminders.py` | CLI entrypoint |
| `tests/test_nso_dates.py` | Date math tests |
| `tests/test_nso_grid.py` | Column matching / parse tests |
| `tests/test_nso_operators.py` | Name split + cache tests |
| `tests/test_nso_decide.py` | Rule matrix tests |
| `tests/test_nso_send_log.py` | Reconciliation + refresh counting |
| `tests/test_nso_templates.py` | Placeholder rendering |
| `tests/test_nso_report.py` | Exceptions workbook columns |
| `tests/test_nso_retention.py` | 14-day delete eligibility |
| `tests/test_nso_pipeline.py` | End-to-end dry-run on fixtures |
| `tests/fixtures/nso/sample_grid.xlsx` | Tiny projected-openings fixture |
| `tests/fixtures/nso/sample_send_log.xlsx` | Tiny send-log fixture |
| `tests/fixtures/nso/sample_email_cache.xlsx` | Tiny cache fixture |
| `docs/ops/nso-daily-automation.md` | Cursor Automation prompt + session setup |
| `README.md` | Short NSO section pointing to ops doc |

---

### Task 1: Config + date helpers (TDD)

**Files:**
- Create: `config/nso-source.json`
- Create: `src/nso_reminders/__init__.py`
- Create: `src/nso_reminders/config.py`
- Create: `src/nso_reminders/dates.py`
- Create: `tests/test_nso_dates.py`

**Interfaces:**
- Produces:
  - `load_nso_config(path: Path | None = None) -> dict`
  - `pacific_today(now: datetime | None = None) -> date`
  - `days_until_opening(opening: date, today: date) -> int`
  - `format_po_filename(prefix: str, day: date, ext: str) -> str`  # e.g. `PO_Grid_081726.xlsx`
  - `parse_mmddyy_from_filename(name: str) -> date | None`

- [ ] **Step 1: Write failing date tests**

```python
# tests/test_nso_dates.py
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_nso_dates.py -v`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement config + dates**

```json
{
  "portal_projected_openings_url": "https://portal.dutchbros.com/directory/projected-openings",
  "portal_crew_search_url": "https://portal.dutchbros.com/crew/search",
  "sharepoint": {
    "daily_downloads": {
      "path": "sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/NSO Reporting/NSO Daily Downloads",
      "url": "https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/NSO%20Reporting/NSO%20Daily%20Downloads?d=wf930162a74cf43db9e1f42a1efa0dc4f&csf=1&web=1&e=x5uZKh"
    },
    "working_files": {
      "path": "sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/NSO Reporting/NSO Working Files",
      "url": "https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/NSO%20Reporting/NSO%20Working%20Files?d=wb7c199da29424da6af0b3e84fa53221b&csf=1&web=1&e=kHqRYQ"
    }
  },
  "thresholds": {
    "first_reminder_days": 4,
    "second_reminder_days": 2,
    "retention_days": 14
  },
  "email": {
    "cc": [],
    "templates_dir": "config/nso-email-templates"
  },
  "timezone": "America/Los_Angeles"
}
```

```python
# src/nso_reminders/config.py
from __future__ import annotations

import json
from pathlib import Path

_DEFAULT = Path(__file__).resolve().parents[2] / "config" / "nso-source.json"


def load_nso_config(path: Path | None = None) -> dict:
    cfg_path = path or _DEFAULT
    return json.loads(cfg_path.read_text(encoding="utf-8"))
```

```python
# src/nso_reminders/dates.py
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_nso_dates.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add config/nso-source.json src/nso_reminders/__init__.py src/nso_reminders/config.py src/nso_reminders/dates.py tests/test_nso_dates.py
git commit -m "feat(nso): add config and Pacific date helpers"
```

---

### Task 2: Grid parser with flexible column matching (TDD)

**Files:**
- Create: `src/nso_reminders/grid.py`
- Create: `tests/test_nso_grid.py`
- Create: `tests/fixtures/nso/sample_grid.xlsx` (built in test setup or a small script step)

**Interfaces:**
- Consumes: pandas DataFrame / Excel path
- Produces:
  - `REQUIRED_COLUMNS = ("newco_id", "projected_opening", "first_tamper_check", "franchisee_operator", "city", "state")`
  - `normalize_header(value: object) -> str`
  - `map_headers(columns: list[str]) -> dict[str, str]`  # canonical → raw header
  - `load_projected_openings(path: Path) -> list[ShopRow]` where `ShopRow` is a TypedDict / dataclass with those fields + raw operator string
  - Raises `ValueError` listing missing required columns (fail loudly)

- [ ] **Step 1: Write failing grid tests**

```python
# tests/test_nso_grid.py
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from nso_reminders.grid import load_projected_openings, map_headers, normalize_header


def test_normalize_header_strips_and_lowers():
    assert normalize_header("  Projected Opening Date ") == "projected opening date"
    assert normalize_header("Franchisee/Operator") == "franchisee/operator"


def test_map_headers_matches_truncated_titles():
    cols = [
        "NewCo ID",
        "Turnover",
        "Projected Opening Date",
        "First Tamper Check",
        "Franchise / Company",
        "Franchisee/Operator",
        "City",
        "State",
    ]
    mapping = map_headers(cols)
    assert mapping["newco_id"] == "NewCo ID"
    assert mapping["projected_opening"] == "Projected Opening Date"
    assert mapping["first_tamper_check"] == "First Tamper Check"
    assert mapping["franchisee_operator"] == "Franchisee/Operator"


def test_map_headers_fails_loud_on_missing(tmp_path: Path):
    df = pd.DataFrame([{"NewCo ID": "CA2908", "City": "Fresno"}])
    path = tmp_path / "bad.xlsx"
    df.to_excel(path, index=False)
    with pytest.raises(ValueError, match="projected_opening"):
        load_projected_openings(path)


def test_load_projected_openings_parses_rows(tmp_path: Path):
    df = pd.DataFrame(
        [
            {
                "NewCo ID": "SC0701",
                "Turnover": "Fri 7/31/26",
                "Projected Opening Date": "Wed 8/12/26",
                "First Tamper Check": "Completed",
                "Franchisee/Operator": "Codi Crain",
                "City": "Newberry",
                "State": "SC",
            },
            {
                "NewCo ID": "CA2908",
                "Turnover": "Mon 8/10/26",
                "Projected Opening Date": date(2026, 8, 21),
                "First Tamper Check": "Pending",
                "Franchisee/Operator": "Kyle Radosevich, Natalie Example",
                "City": "Fresno",
                "State": "CA",
            },
        ]
    )
    path = tmp_path / "PO_Grid_081726.xlsx"
    df.to_excel(path, index=False)
    rows = load_projected_openings(path)
    assert rows[0].newco_id == "SC0701"
    assert rows[0].first_tamper_check == "Completed"
    assert rows[1].projected_opening == date(2026, 8, 21)
    assert "Kyle" in rows[1].franchisee_operator
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest tests/test_nso_grid.py -v`  
Expected: FAIL

- [ ] **Step 3: Implement `grid.py`**

Match headers by normalized contains / equality for:
- `newco_id` ← "newco id"
- `projected_opening` ← starts with "projected opening" (never "turnover")
- `first_tamper_check` ← "first tamper check"
- `franchisee_operator` ← "franchisee/operator" or "franchisee operator"
- `city` ← exact "city"
- `state` ← exact "state"

Parse opening dates from `datetime`/`date`, Excel serials, or strings like `Wed 8/12/26` / `8/12/26`. Blank → `None`. Status/name fields: strip strings; blank → `""`.

```python
# src/nso_reminders/grid.py (skeleton — implement fully in this task)
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import pandas as pd


@dataclass(frozen=True)
class ShopRow:
    newco_id: str
    projected_opening: date | None
    first_tamper_check: str
    franchisee_operator: str
    city: str
    state: str


def normalize_header(value: object) -> str:
    ...


def map_headers(columns: list[str]) -> dict[str, str]:
    ...


def load_projected_openings(path: Path) -> list[ShopRow]:
    ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest tests/test_nso_grid.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/nso_reminders/grid.py tests/test_nso_grid.py
git commit -m "feat(nso): parse projected openings grid with flexible headers"
```

---

### Task 3: Operator name split + email cache (TDD)

**Files:**
- Create: `src/nso_reminders/operators.py`
- Create: `tests/test_nso_operators.py`

**Interfaces:**
- Produces:
  - `split_operator_names(raw: str) -> list[str]`
  - `load_email_cache(path: Path) -> dict[str, str]`  # normalized name → email
  - `save_email_cache(path: Path, cache: dict[str, str]) -> None`
  - `normalize_person_name(name: str) -> str`  # collapse whitespace, casefold for keys
  - `resolve_from_cache(names: list[str], cache: dict[str, str]) -> tuple[list[str], list[str]]`  # (emails, unresolved_names)

- [ ] **Step 1: Write failing tests**

```python
# tests/test_nso_operators.py
from pathlib import Path

from nso_reminders.operators import (
    load_email_cache,
    resolve_from_cache,
    save_email_cache,
    split_operator_names,
)


def test_split_operator_names_on_commas():
    assert split_operator_names("Kyle Radosevich, Natalie Example") == [
        "Kyle Radosevich",
        "Natalie Example",
    ]
    assert split_operator_names("Codi Crain") == ["Codi Crain"]
    assert split_operator_names("") == []


def test_cache_roundtrip(tmp_path: Path):
    path = tmp_path / "PO_Operator_Email_Cache.xlsx"
    save_email_cache(path, {"codi crain": "codi@example.com"})
    loaded = load_email_cache(path)
    assert loaded["codi crain"] == "codi@example.com"


def test_resolve_partial():
    cache = {"kyle radosevich": "kyle@example.com"}
    emails, missing = resolve_from_cache(
        ["Kyle Radosevich", "Natalie Example"], cache
    )
    assert emails == ["kyle@example.com"]
    assert missing == ["Natalie Example"]
```

- [ ] **Step 2: Run to verify fail** → `pytest tests/test_nso_operators.py -v`

- [ ] **Step 3: Implement `operators.py`**

Cache Excel columns: `Name`, `Email` (header case-insensitive). Empty file / missing path → empty dict on load (caller may create).

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/nso_reminders/operators.py tests/test_nso_operators.py
git commit -m "feat(nso): operator name split and email cache workbook"
```

---

### Task 4: Send-log model + Outlook state reconciliation (TDD)

**Files:**
- Create: `src/nso_reminders/send_log.py`
- Create: `tests/test_nso_send_log.py`

**Interfaces:**
- Produces dataclass `SendLogEntry` with fields:
  - `newco_id: str`
  - `projected_opening: date | None`
  - `emails_sent_count: int`  # 0, 1, or 2 counted sends
  - `pending_draft_message_id: str | None`
  - `pending_draft_kind: str | None`  # "1" | "2" | None
  - `last_sent_at: date | None`
- `load_send_log(path: Path) -> dict[str, SendLogEntry]`
- `save_send_log(path: Path, entries: dict[str, SendLogEntry]) -> None`
- `reconcile_entry(entry: SendLogEntry, outlook_state: str) -> tuple[SendLogEntry, str | None]`
  - `outlook_state` ∈ `{"in_drafts", "in_sent", "missing"}`
  - returns `(updated_entry, exception_type_or_none)` where missing → `"draft_skipped"`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_nso_send_log.py
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
```

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement `send_log.py`** including Excel load/save with columns:  
  `NewCo ID`, `Projected Opening`, `Emails Sent Count`, `Pending Draft Message ID`, `Pending Draft Kind`, `Last Sent At`

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/nso_reminders/send_log.py tests/test_nso_send_log.py
git commit -m "feat(nso): send-log workbook and draft reconciliation"
```

---

### Task 5: Decision engine rule matrix (TDD)

**Files:**
- Create: `src/nso_reminders/decide.py`
- Create: `tests/test_nso_decide.py`

**Interfaces:**
- Consumes: `ShopRow`, `SendLogEntry | None`, `today: date`, thresholds from config
- Produces dataclass `ShopDecision`:
  - `newco_id`, `action` ∈ `{"none","draft_1","draft_2","refresh_draft","exception"}`
  - `exception_type: str | None`
  - `description: str`
  - `recommended_action: str`
  - `template_key: str | None`  # `seal_verification` | `tamper_check` | `urgent_refresh`
  - `days_until: int | None`
  - `status: str`

```python
def decide_shop(
    shop: ShopRow,
    log: SendLogEntry | None,
    today: date,
    *,
    first_reminder_days: int = 4,
    second_reminder_days: int = 2,
) -> ShopDecision:
    ...
```

**Rule order (implement exactly):**

1. If status == `Completed` → `none`
2. If status == `No Devices` → `exception` / `no_devices`
3. If status not in `{Seal Verification, Pending}` → `exception` / `unknown_status`
4. If opening is `None` → `exception` / `blank_opening`
5. If `days_until < 0` → `exception` / `past_opening`
6. Choose template: Seal Verification → `seal_verification`; Pending → `tamper_check`
7. Let `sent = log.emails_sent_count if log else 0`, `pending = log.pending_draft_message_id if log else None`
8. If `sent >= 2` → `none`
9. If `days_until <= second_reminder_days` and `pending` and `sent == 0` → `refresh_draft` / `stale_draft_refreshed` / template `urgent_refresh`
10. If `pending` → `none` (live draft already exists; do not duplicate)
11. If `days_until <= second_reminder_days` and `sent == 0` and not `pending` → `draft_1` with `urgent_refresh` + exception_type `late_catch` (still action `draft_1`)
12. If `days_until <= first_reminder_days` and `sent == 0` → `draft_1` with status template
13. If `days_until <= second_reminder_days` and `sent == 1` → `draft_2` with status template
14. Else → `none`

- [ ] **Step 1: Write failing matrix tests** covering at least:

```python
# tests/test_nso_decide.py
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
```

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement `decide.py` exactly per rule order above** — every exception gets a non-empty `description` and `recommended_action`

- [ ] **Step 4: Run to verify pass**

- [ ] **Step 5: Commit**

```bash
git add src/nso_reminders/decide.py tests/test_nso_decide.py
git commit -m "feat(nso): decide per-shop reminder actions from rules"
```

---

### Task 6: Email templates (TDD)

**Files:**
- Create: `config/nso-email-templates/seal_verification.md`
- Create: `config/nso-email-templates/tamper_check.md`
- Create: `config/nso-email-templates/urgent_refresh.md`
- Create: `src/nso_reminders/templates.py`
- Create: `tests/test_nso_templates.py`

**Interfaces:**
- Produces: `render_email(template_key: str, context: dict, templates_dir: Path) -> tuple[str, str]`  # subject, body  
- Template format: first line `Subject: ...`, blank line, then body. Placeholders `{{newco_id}}`, `{{city}}`, `{{state}}`, `{{operator_names}}`, `{{projected_opening}}`, `{{status}}`

- [ ] **Step 1: Write starter templates marked REPLACE ME**

```markdown
Subject: REPLACE ME — Seal Verification needed before {{newco_id}} opens {{projected_opening}}

REPLACE ME — Body for Seal Verification (step 1).
Shop: {{newco_id}} · {{city}}, {{state}}
Operator(s): {{operator_names}}
Status: {{status}}
```

(Same pattern for `tamper_check.md` and `urgent_refresh.md` with distinct REPLACE ME labels.)

- [ ] **Step 2: Write failing render test**

```python
def test_render_replaces_placeholders(tmp_path):
    (tmp_path / "seal_verification.md").write_text(
        "Subject: Hello {{newco_id}}\n\nBody {{city}}\n", encoding="utf-8"
    )
    from nso_reminders.templates import render_email
    subject, body = render_email(
        "seal_verification",
        {"newco_id": "CA2908", "city": "Fresno", "state": "CA",
         "operator_names": "Codi", "projected_opening": "2026-08-21", "status": "Seal Verification"},
        tmp_path,
    )
    assert subject == "Hello CA2908"
    assert "Fresno" in body
```

- [ ] **Step 3: Implement `templates.py`** — missing template file raises `FileNotFoundError`; unknown placeholder left intact or raise — choose **raise `KeyError` on missing context key used by template** after a simple `{{name}}` replace

- [ ] **Step 4: Tests pass; commit**

```bash
git add config/nso-email-templates src/nso_reminders/templates.py tests/test_nso_templates.py
git commit -m "feat(nso): editable email templates with placeholder render"
```

---

### Task 7: Exceptions report writer (TDD)

**Files:**
- Create: `src/nso_reminders/report.py`
- Create: `tests/test_nso_report.py`

**Interfaces:**
- `write_exceptions_report(path: Path, rows: list[dict]) -> Path`
- Required columns exactly:  
  `NewCo ID`, `Projected Opening`, `Days Until Opening`, `First Tamper Check`, `Franchisee/Operator`, `Resolved Emails`, `Action`, `Exception Type`, `Description`, `Recommended Action`, `Draft / Message ID`

- [ ] **Step 1: Write test that writes then reads back columns + a sample exception description**

- [ ] **Step 2: Implement writer with openpyxl/pandas**

- [ ] **Step 3: Pass + commit**

```bash
git add src/nso_reminders/report.py tests/test_nso_report.py
git commit -m "feat(nso): write PO_Reporting_Exceptions workbook"
```

---

### Task 8: Retention helper (TDD)

**Files:**
- Create: `src/nso_reminders/retention.py`
- Create: `tests/test_nso_retention.py`

**Interfaces:**
- `should_delete_filename(name: str, today: date, retention_days: int = 14) -> bool`
  - `True` only for `PO_Grid_*` / `PO_Reporting_Exceptions_*` whose parsed date age ≥ retention_days
  - Always `False` for `PO_Operator_Email_Cache.xlsx` and `PO_Send_Log.xlsx`

- [ ] **Step 1–4: TDD as usual; commit**

```bash
git add src/nso_reminders/retention.py tests/test_nso_retention.py
git commit -m "feat(nso): 14-day retention eligibility for PO files"
```

---

### Task 9: Dry-run pipeline + CLI (TDD)

**Files:**
- Create: `src/nso_reminders/pipeline.py`
- Create: `scripts/run_nso_reminders.py`
- Create: `tests/test_nso_pipeline.py`
- Create: `tests/fixtures/nso/sample_grid.xlsx` (if not already persisted), `sample_send_log.xlsx`, `sample_email_cache.xlsx`

**Interfaces:**
- `run_dry_run(*, grid_path: Path, send_log_path: Path, cache_path: Path, out_dir: Path, today: date | None, config: dict) -> dict`
  - Returns summary: `{decisions: [...], report_path, draft_previews: [{newco_id, to, cc, subject, body, action}], reconciled_log_path}`
  - Writes exceptions report into `out_dir` using `format_po_filename("PO_Reporting_Exceptions", today, ".xlsx")`
  - Does **not** touch Outlook or SharePoint
- CLI:

```bash
python3 scripts/run_nso_reminders.py --dry-run \
  --grid path/to/PO_Grid_MMDDYY.xlsx \
  --send-log path/to/PO_Send_Log.xlsx \
  --cache path/to/PO_Operator_Email_Cache.xlsx \
  --out /tmp/nso-dry-run
```

Pipeline steps inside `run_dry_run`:
1. Load config thresholds + CC list
2. Load grid (fail loud)
3. Load send-log + cache (missing file → empty)
4. For each log entry with pending draft, accept optional `outlook_states: dict[str, str]` (message_id → state); default all `in_drafts` in dry-run unless provided
5. Reconcile → decide each shop → resolve emails from cache only in dry-run (unresolved → exception `no_crew_match` unless action was already exception)
6. Render templates for draft actions
7. Write report + JSON draft previews file `draft_previews.json`

- [ ] **Step 1: Fixture-based test** asserting a Completed shop is `none`, a Pending@4days with cached email gets a draft preview, No Devices gets exception row

- [ ] **Step 2: Implement pipeline + CLI**

- [ ] **Step 3: `pytest tests/test_nso_pipeline.py -v` PASS; also `pytest -v` full suite green**

- [ ] **Step 4: Commit**

```bash
git add src/nso_reminders/pipeline.py scripts/run_nso_reminders.py tests/test_nso_pipeline.py tests/fixtures/nso
git commit -m "feat(nso): dry-run pipeline and CLI"
```

---

### Task 10: Ops runbook + README pointer

**Files:**
- Create: `docs/ops/nso-daily-automation.md`
- Modify: `README.md` (add short NSO section; do not remove Worldpay content)
- Modify: `docs/superpowers/specs/2026-08-17-nso-tamper-check-reminders-design.md` — set Status to `Approved; implementation plan ready`

**Ops doc must include:**
1. One-time: create Cursor Automation, attach repo, schedule daily (suggest after morning Pacific), enable browser tools, note saved session / re-login
2. Exact SharePoint folder paths + filenames from spec
3. Paste-ready agent prompt covering: open portal → DOWNLOAD → save `PO_Grid_MMDDYY` → download working files cache/send-log → run dry-run first OR live steps → Crew Search for unresolved names → Outlook web drafts → reconcile Sent/Drafts → upload report + updated cache/send-log → retention delete ≥14 days → stop clearly on auth failure
4. Failure table matching spec §13
5. How to supply CC list + replace REPLACE ME templates
6. Reminder that first live day should use `--dry-run` against a real grid export

- [ ] **Step 1: Write ops doc and README section**

- [ ] **Step 2: Commit**

```bash
git add docs/ops/nso-daily-automation.md README.md docs/superpowers/specs/2026-08-17-nso-tamper-check-reminders-design.md
git commit -m "docs(nso): daily automation runbook and README pointer"
```

---

### Task 11: Full verification gate

- [ ] **Step 1: Run full test suite**

```bash
pytest -v
```

Expected: all Worldpay + NSO tests PASS

- [ ] **Step 2: Manual dry-run smoke** (using fixture grid)

```bash
python3 scripts/run_nso_reminders.py --dry-run \
  --grid tests/fixtures/nso/sample_grid.xlsx \
  --send-log tests/fixtures/nso/sample_send_log.xlsx \
  --cache tests/fixtures/nso/sample_email_cache.xlsx \
  --out /tmp/nso-dry-run
ls /tmp/nso-dry-run
```

Expected: exceptions xlsx + `draft_previews.json` present

- [ ] **Step 3: Commit any fixes; push branch; update PR description with plan + engine status**

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|---|---|
| Pacific calendar days / ≤4 / ≤2 catch-up | 1, 5 |
| Projected Opening + NewCo ID | 2, 5 |
| Status matrix + No Devices exceptions | 5 |
| Multi-operator + cache + no guess | 3, 9 |
| Sent only via Sent Items; refresh stale draft | 4, 5 |
| Late catch inside 2 days | 5 |
| Editable templates + CC config | 1, 6 |
| Exceptions report columns + descriptions | 7, 9 |
| SharePoint filenames + 14-day retention (cache/log exempt) | 1, 8, 10 |
| Dry-run without Outlook/SharePoint | 9 |
| Fail loud on missing columns | 2 |
| Browser automation / no Graph / re-login stop | 10 |
| Worldpay code untouched | all tasks |

## Out of this plan (still product placeholders)

- Final CC addresses
- Final email wording (REPLACE ME starters only)
- Real `PO_Grid` export to pin production headers (parser already flexible + loud)

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-17-nso-tamper-check-reminders.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
