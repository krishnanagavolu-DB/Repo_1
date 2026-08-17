# NSO daily automation — First Tamper Check reminders

## What happens each day

1. Cursor Automation opens the portal Projected Openings page (saved browser session).
2. Downloads the grid and uploads it to SharePoint **NSO Daily Downloads** as `PO_Grid_MMDDYY.<ext>`.
3. Downloads `PO_Send_Log.xlsx` and `PO_Operator_Email_Cache.xlsx` from **NSO Working Files**.
4. Runs the decision engine (dry-run locally, or live after approval).
5. Looks up missing operator emails on Crew Search (exact 1:1 only); updates the cache.
6. Creates or refreshes Outlook **drafts** (web UI) — TO = operator(s), CC = config list. Nothing auto-sends.
7. Reconciles Drafts vs Sent Items; updates the send-log.
8. Uploads `PO_Reporting_Exceptions_MMDDYY.xlsx` plus updated cache/send-log to **NSO Working Files**.
9. Deletes `PO_Grid_*` and `PO_Reporting_Exceptions_*` files that are **≥ 14 calendar days** old. Never delete the cache or send-log.

## One-time setup

1. Create an automation at [cursor.com/automations](https://cursor.com/automations).
2. Trigger: **Scheduled** — daily (after morning Pacific is fine).
3. Attach this repository.
4. Enable browser tools and keep a **saved browser session** logged into:
   - `https://portal.dutchbros.com`
   - Outlook on the web
   - Dutch Bros SharePoint
5. When MFA / session expiry hits, the run **stops** and asks you to re-login. Do not invent alternate sources.

### Config you own

- CC list: `config/nso-source.json` → `email.cc` (array of addresses). Empty until you fill it.
- Email wording: `config/nso-email-templates/*.md` — replace every `REPLACE ME` line.
- Thresholds: `config/nso-source.json` → `thresholds` (`first_reminder_days`, `second_reminder_days`, `retention_days`).

### SharePoint folders (do not invent alternatives)

- Daily downloads:  
  `sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/NSO Reporting/NSO Daily Downloads`  
  https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/NSO%20Reporting/NSO%20Daily%20Downloads?d=wf930162a74cf43db9e1f42a1efa0dc4f&csf=1&web=1&e=x5uZKh
- Working files:  
  `sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/NSO Reporting/NSO Working Files`  
  https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/NSO%20Reporting/NSO%20Working%20Files?d=wb7c199da29424da6af0b3e84fa53221b&csf=1&web=1&e=kHqRYQ

Persistent files in Working Files (never auto-deleted):

- `PO_Operator_Email_Cache.xlsx`
- `PO_Send_Log.xlsx`

## First live day (safe)

1. Manually DOWNLOAD one real grid from the portal.
2. Run dry-run only:

```bash
pip install -r requirements.txt
python3 scripts/run_nso_reminders.py --dry-run \
  --grid /path/to/PO_Grid_MMDDYY.xlsx \
  --send-log /path/to/PO_Send_Log.xlsx \
  --cache /path/to/PO_Operator_Email_Cache.xlsx \
  --out /tmp/nso-dry-run
```

3. Review `/tmp/nso-dry-run/PO_Reporting_Exceptions_*.xlsx` and `draft_previews.json`.
4. Only after that looks right, enable the full automation prompt below.

## Agent prompt (paste into the automation)

```text
Run the Dutch Bros NSO First Tamper Check daily reminders.

Constraints:
- Use the saved browser session (portal + Outlook web + SharePoint). If login/MFA is required, STOP and report "please re-login". Do not invent alternate drop locations.
- Create Outlook DRAFTS only. Never click Send.
- Use only the SharePoint folders listed in config/nso-source.json.

Steps:
1. Open https://portal.dutchbros.com/directory/projected-openings
2. Click DOWNLOAD. Save the file as PO_Grid_MMDDYY with today's Pacific date (MMDDYY).
3. Upload that file to SharePoint NSO Daily Downloads.
4. From NSO Working Files, download PO_Send_Log.xlsx and PO_Operator_Email_Cache.xlsx (create empty workbooks with the expected headers if missing).
5. Run:
   python3 scripts/run_nso_reminders.py --dry-run \
     --grid <local PO_Grid path> \
     --send-log <local PO_Send_Log path> \
     --cache <local cache path> \
     --out /tmp/nso-run
6. For each draft_preview in draft_previews.json:
   - Resolve any missing operator emails via https://portal.dutchbros.com/crew/search
   - Accept only an exact 1:1 name match; otherwise leave as exception (do not guess)
   - Update the cache workbook
   - In Outlook web, create or replace ONE draft per NewCo ID: TO=resolved emails, CC=config email.cc, subject/body from the preview
   - For refresh_draft actions, replace the existing unsent draft for that shop
7. Reconcile each pending draft message id: still in Drafts / found in Sent Items / missing.
   Update PO_Send_Log.xlsx accordingly (count as sent ONLY when found in Sent Items).
8. Upload to NSO Working Files:
   - /tmp/nso-run/PO_Reporting_Exceptions_MMDDYY.xlsx
   - updated PO_Operator_Email_Cache.xlsx
   - updated PO_Send_Log.xlsx
9. In both NSO folders, delete only PO_Grid_* and PO_Reporting_Exceptions_* files whose filename date is ≥ 14 calendar days old. Never delete cache or send-log.
10. Summarize: drafts created/refreshed, exceptions by type, any auth failures.

If the grid is missing required columns, STOP with the parser error. Do not create drafts.
```

## Failure modes

| Issue | Expected behavior |
|---|---|
| Portal / Microsoft session expired | Stop; report re-login needed |
| DOWNLOAD / grid missing required columns | Stop; no drafts |
| Crew Search ambiguous / empty | Exception row; no guessed recipient |
| Outlook draft create fails for one shop | Exception for that shop; continue others when safe |
| SharePoint upload fails | Report failure; do not claim success |

## Local dry-run (fixtures)

```bash
python3 scripts/run_nso_reminders.py --dry-run \
  --grid tests/fixtures/nso/sample_grid.xlsx \
  --send-log tests/fixtures/nso/sample_send_log.xlsx \
  --cache tests/fixtures/nso/sample_email_cache.xlsx \
  --out /tmp/nso-dry-run
```

## Spec / plan

- Design: `docs/superpowers/specs/2026-08-17-nso-tamper-check-reminders-design.md`
- Plan: `docs/superpowers/plans/2026-08-17-nso-tamper-check-reminders.md`
