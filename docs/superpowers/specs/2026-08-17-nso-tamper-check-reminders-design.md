# NSO First Tamper Check Reminders — Design

**Date:** 2026-08-17  
**Status:** Awaiting user review before implementation planning  
**Audience:** Product / payments ops (New Shop Opening)  
**Channel (v1):** Daily Cursor Automation + Outlook drafts for human approval

---

## 1. Goal

Automate the daily check of upcoming Dutch Bros shop openings so Franchisee/Operators are reminded to complete **First Tamper Check** before opening — without surprise emails in v1.

Each day:

1. Pull the Projected Openings grid from the portal.
2. Decide who needs a reminder (and which step they are on).
3. Resolve operator email(s) via Crew Search.
4. Create **Outlook drafts** (TO + constant CC) for approval — nothing auto-sends.
5. Write an exceptions report and maintain send/cache state in SharePoint.
6. Retire automation-generated files after 14 calendar days.

Later upgrade path: drafts → auto-send (same rules, different send step).

---

## 2. Decisions locked

| Topic | Decision |
|---|---|
| Approval model (v1) | Semi-automatic: create Outlook drafts; human clicks Send |
| Upgrade path | Same pipeline; flip draft → send for full auto |
| Portal access | Personal portal login only (no service account, no IT) |
| Portal data pull | Browser automation of `https://portal.dutchbros.com/directory/projected-openings` (DOWNLOAD / grid) |
| Email lookup | Browser automation of `https://portal.dutchbros.com/crew/search`; exact 1:1 name match only |
| Email delivery | Outlook **web/app UI** only — no Microsoft Graph / backend mail API |
| SharePoint I/O | SharePoint **web UI** only — no Graph / backend API |
| Runtime | Cloud Cursor Automation with a **saved browser session**; when session expires, run stops and asks for re-login |
| Timing model | Catch-up safe: #1 at ≤4 days out; #2 at ≤2 days out |
| Clock | Calendar days in **America/Los_Angeles** |
| Opening date column | **Projected Opening** (not Turnover) |
| Shop key | **NewCo ID** |
| Status progression | Seal Verification (step 1) → Pending (step 2) → Completed |
| What stops reminders | Only **Completed** |
| No Devices / unknown status | Exception list only (no email); richer exception handling is future work |
| Multi-operator cell | Split on commas; one draft with all resolved emails in TO |
| Ambiguous / missing crew match | Do not guess — exception list |
| Sent definition | Count as sent only when message is found in Sent Items (not when draft is created) |
| Stale draft at 2-day mark | Replace with one refreshed urgent draft (one live draft per shop) |
| Email wording | Editable template files (copy TBD) |
| Constant CC list | Config file (addresses TBD) |

---

## 3. Architecture & daily data flow

```text
Cursor Automation (daily, cloud)
  │
  ├─ Browser (saved session as you)
  │    1. Open portal projected-openings → DOWNLOAD grid
  │    2. Upload PO_Grid_MMDDYY.* to SharePoint NSO Daily Downloads
  │    3. For needed shops: Crew Search → resolve emails (update cache)
  │    4. Outlook web: create/replace drafts (TO + CC)
  │    5. Outlook web: reconcile Drafts vs Sent for send-log
  │    6. Upload PO_Reporting_Exceptions_MMDDYY.xlsx to NSO Working Files
  │    7. Update PO_Operator_Email_Cache.xlsx + PO_Send_Log.xlsx
  │    8. Delete automation files ≥ 14 calendar days old in both folders
  │
  └─ Python decision engine (this repo)
       Read grid + send-log + cache
       → per-shop actions: none | draft #1 | draft #2 | refresh draft | exception
```

**Boundaries**

- **Portal** = source of truth for openings + crew emails  
- **SharePoint NSO folders** = daily grids, exception reports, cache, send-log (not Git)  
- **This repo** = decision engine, templates, config, automation prompt, tests  
- **Outlook** = draft mailbox for human approval  
- **Cursor Automation** = daily operator; re-login is the only expected human interrupt besides Send

**Auth model (explicit)**

- One saved browser profile / session cookies for portal + Microsoft (Outlook web + SharePoint).
- No Azure app registration, no Graph tokens, no IT-provisioned service account.
- On auth failure / MFA challenge: **stop the run**, leave prior artifacts as-is, surface a clear "please re-login" failure. Do not invent alternate drop locations or silent skips of the whole pipeline.

---

## 4. SharePoint storage

### Daily Downloads

- Folder:  
  `sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/NSO Reporting/NSO Daily Downloads`  
- URL:  
  https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/NSO%20Reporting/NSO%20Daily%20Downloads?d=wf930162a74cf43db9e1f42a1efa0dc4f&csf=1&web=1&e=x5uZKh  
- Filename: `PO_Grid_MMDDYY.<original extension>`  
- Retention: delete files **≥ 14 calendar days** old (Pacific date of the filename / file date)

### Working Files

- Folder:  
  `sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/NSO Reporting/NSO Working Files`  
- URL:  
  https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/NSO%20Reporting/NSO%20Working%20Files?d=wb7c199da29424da6af0b3e84fa53221b&csf=1&web=1&e=kHqRYQ  
- Daily report: `PO_Reporting_Exceptions_MMDDYY.xlsx` (retention: ≥ 14 calendar days)  
- Persistent (never auto-deleted):
  - `PO_Operator_Email_Cache.xlsx` — name → email lookup grown over time  
  - `PO_Send_Log.xlsx` — per NewCo ID reminder / draft / sent state

Config for these paths lives in-repo (e.g. `config/nso-source.json`) so the automation does not invent alternate drop locations.

---

## 5. Decision rules

### Status → eligibility

| First Tamper Check | Meaning | Action |
|---|---|---|
| Completed | Both steps done | No email |
| Seal Verification | Step 1 outstanding | Eligible (Seal Verification template) |
| Pending | Step 2 outstanding | Eligible (Tamper Check template) |
| No Devices | Cannot start yet | Exception only |
| Other / blank | Unknown | Exception only |

### Timing (eligible shops only)

Days until opening = calendar days from **today (America/Los_Angeles)** to **Projected Opening**.

| Condition | Action |
|---|---|
| ≤ 4 days out, no email #1 counted as sent, no live draft | Create draft #1 |
| ≤ 2 days out, email #1 sent, still not Completed, no live draft | Create draft #2 |
| ≤ 2 days out, email #1 draft still unsent | **Replace** that draft with one refreshed urgent draft; report as refreshed |
| Already 2 drafts counted as sent, or Completed | Do nothing |
| Opening blank / unreadable / in the past | Exception |
| Brand-new shop already inside the 2-day window, nothing sent yet | Create one urgent draft immediately; flag as late catch in the report |

**How drafts count toward the two-email max**

- A refreshed draft is still **email #1** until Sent Items confirms it. Sending it advances the log to "email #1 sent," which then unlocks email #2 on a later run if still not Completed and still ≤ 2 days out.
- A late-catch urgent draft (first contact already inside the 2-day window) also counts as **email #1** when sent. Email #2 may follow on a subsequent run under the normal ≤2-day + #1-sent rule.
- Never more than two **counted sends** per NewCo ID for a given projected opening. Template always matches **current** status.

### Send-log reconciliation (before creating new drafts)

For each pending draft recorded with an Outlook message id:

| Outlook state | Meaning | Next |
|---|---|---|
| Still in Drafts | Not sent | Do not create a duplicate; may replace if 2-day refresh applies |
| Found in Sent Items | Sent | Mark sent with real send date; unlock eligibility for #2 if timing fits |
| Missing (deleted) | Deliberately skipped | Clear pending draft; shop eligible for a fresh draft; note in exceptions report |

---

## 6. Operator email resolution

1. Read Franchisee/Operator cell; split on commas into names.  
2. For each name: check `PO_Operator_Email_Cache.xlsx` first.  
3. If missing: open Crew Search, paste name, accept only an exact **1:1** match; write hit to cache.  
4. Zero or multiple matches → exception for that name; do not guess.  
5. Multi-operator cell with partial success → one draft to all resolved emails; unresolved name listed as exception on that row.

---

## 7. Outlook draft shape

- **TO:** all resolved operator emails for the shop  
- **CC:** constant list from config (placeholder until provided)  
- **Subject / body:** from editable templates under e.g. `config/nso-email-templates/`  
  - `seal_verification.md`  
  - `tamper_check.md` (Pending)  
  - `urgent_refresh.md` (replacement when #1 still unsent at ≤2 days)  
- Placeholders: NewCo ID, city, state, operator name(s), projected opening date, status  
- Starter copy ships marked clearly for replacement; final wording is TBD from product

---

## 8. Exceptions report (`PO_Reporting_Exceptions_MMDDYY.xlsx`)

One workbook covering the full run (not only failures). Minimum columns:

| Column | Purpose |
|---|---|
| NewCo ID | Shop key |
| Projected Opening | Date used for timing |
| Days Until Opening | Computed |
| First Tamper Check | Status as of download |
| Franchisee/Operator | Raw cell |
| Resolved Emails | TO candidates |
| Action | none / draft_1 / draft_2 / refresh_draft / exception |
| Exception Type | e.g. no_devices, unknown_status, no_crew_match, ambiguous_crew_match, blank_opening, past_opening, stale_draft_refreshed, draft_skipped, late_catch, session_auth |
| Description | Plain-language explanation |
| Recommended Action | What a human should do next |
| Draft / Message ID | If applicable |

Clear description is required for every exception row.

---

## 9. Repo layout (implementation target)

```text
config/
  nso-source.json              # SharePoint folder paths, thresholds, CC list
  nso-email-templates/         # editable wording
src/nso_reminders/             # decision engine (parse, rules, report, send-log)
scripts/run_nso_reminders.py   # CLI: dry-run vs live orchestration hooks
docs/ops/nso-daily-automation.md
tests/                         # unit tests for rules + edge cases
```

Existing Worldpay dashboard code stays untouched. NSO is a sibling package in the same repo.

---

## 10. Testing & dry-run

**Unit tests (offline, no credentials):** sample grids covering Completed, Pending at 5/4/2 days, Seal Verification, No Devices, blank/past opening, multi-operator, #1 unsent at 2 days → refresh, late catch inside 2-day window.

**Dry-run mode:** produce the exceptions workbook + draft previews without creating Outlook drafts or writing to SharePoint. First live validation uses dry-run against a real `PO_Grid` export.

**Column-header risk:** exact DOWNLOAD headers are not yet confirmed (screenshot titles were truncated). Parser matches flexibly and **fails loudly** if a required column is missing — never guess. A real `PO_Grid` export pins headers before live emailing.

---

## 11. Out of scope for v1

- Auto-sending emails  
- Rich exception remediation workflows  
- Interpreting status values beyond Completed / Seal Verification / Pending / No Devices  
- Automating the initial portal / Microsoft login (human re-login on expiry)  
- Any leadership dashboard / UI for this process  
- Microsoft Graph / Azure app registration / IT-provisioned credentials  

---

## 12. Open placeholders (needed before live sends)

1. Constant **CC** email list  
2. Final email **wording** for Seal Verification, Pending, and urgent refresh  
3. One real **PO_Grid** export to lock column headers and file type  

These do not block building or unit-testing the decision engine.

---

## 13. Failure modes

| Issue | Expected behavior |
|---|---|
| Portal / Microsoft session expired | Stop; report re-login needed; do not invent alternate sources |
| DOWNLOAD / grid parse missing required columns | Stop; no drafts; no partial SharePoint publish of a bad decisions set |
| Crew Search ambiguous / empty | Exception row; no guessed recipient |
| Outlook draft create fails for one shop | Record exception for that shop; continue others when safe |
| SharePoint upload fails | Report failure; do not claim success |

---

## 14. Success criteria for v1

- Daily automation produces a SharePoint grid + exceptions report with clear exception text.  
- Eligible shops get at most one live Outlook draft at a time, with correct TO/CC and status-matched wording.  
- Completed shops never get drafts. No Devices / unknown / bad dates are listed, not emailed.  
- Send-log only advances when Sent Items confirms send; stale #1 drafts are refreshed at ≤2 days.  
- Files ≥ 14 days old are cleaned from both NSO folders; cache and send-log are retained.  
- Dry-run and unit tests cover the rules without requiring live credentials.
