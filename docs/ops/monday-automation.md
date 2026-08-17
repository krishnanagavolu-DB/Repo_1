# Monday automation — Worldpay In Shop dashboard refresh

## Canonical SharePoint drop zone

| Field | Value |
|---|---|
| Site | `CoreShopTech` |
| Folder | `Shared Documents/General/Payment Systems/Reports/Worldpay/WP Weekly Reports` |
| SharePoint link | [Open WP Weekly Reports](https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/Worldpay/WP%20Weekly%20Reports?d=w23de4595d91f489fa3c825c6b52e4fcd&csf=1&web=1&e=uSIZpB) |
| Machine-readable copy | [`config/sharepoint-source.json`](../../config/sharepoint-source.json) |

Do not use a different folder unless that config file is updated first.

## Schedule

| Field | Value |
|---|---|
| Cadence | Every **Monday** |
| Local time | **11:00 AM** |
| Timezone | **America/Los_Angeles** (Pacific) |
| Cursor cron | `CRON_TZ=America/Los_Angeles 0 11 * * 1` |

If reports land later than 11 AM, re-run the automation manually that day; do not publish a partial week.

## What happens each week

1. Michelle / Worldpay drops two Excels into the SharePoint folder above.
2. A **Cursor Automation** (Monday 11 AM Pacific) pulls the newest Auth + Interchange pair into this repo.
3. Ingest validates raw files, rebuilds `data/processed/dashboard.json`, and copies it to:
   - `site/data/dashboard.json` (leadership homepage)
   - `site/preview/data/dashboard.json` (preview page, if present)
4. Certification checks the output copies and writes `data/processed/validation_report.json`.
5. A certified data-only commit pushes directly to `main`; GitHub Pages deploys it and CI certifies it again.
6. Leadership opens the **same Pages URL** — no new link needed.
   Preview UI work stays at `/preview/` until promoted (see `docs/ops/preview-workflow.md`).

## One-time setup (you must click this — agents cannot create Automations)

**Shortest path for a non-developer:** follow
[`docs/ops/automation-setup-checklist.md`](automation-setup-checklist.md)
(copy/paste only — do not invent settings).  
Prompt file to paste: [`monday-automation-prompt.txt`](monday-automation-prompt.txt).  
If Microsoft blocks sign-in: forward [`it-sharepoint-access-request.md`](it-sharepoint-access-request.md) to Tech Help.

### GitHub Pages
1. Repo **Settings → Pages → Source: GitHub Actions**
2. Private repo Pages requires **GitHub Pro** (or org Team+)
3. After first deploy, share the Pages URL with leadership

### Why your browser login is not enough
Signing into SharePoint on your laptop only authenticates **your browser**.
Cursor Automations run on Cursor’s cloud machines. They need a **separate**
SharePoint connection (MCP + Microsoft sign-in, or an IT app registration).

Cursor has **no built-in SharePoint button**. File access is via an MCP server
that talks to Microsoft Graph / SharePoint.

### A. Connect SharePoint once (required)

1. In Cursor: **Dashboard → Integrations & MCP** (team admin if this is a team setup)
2. Add a **SharePoint / Microsoft 365 / Graph MCP** (Marketplace or IT-provided HTTP MCP)
3. Complete the **Microsoft OAuth** sign-in when prompted (use your `@dutchbros.com` account)
4. Confirm the MCP can list the WP Weekly Reports folder before relying on Monday

**If this must run unattended for the team** (not only while you are online):
- Set the Automation permission to **Team Owned**
- Re-authenticate the SharePoint MCP for the **team automations service account**
  (a personal OAuth login will not keep working after you promote it to Team Owned)

**If Conditional Access / MFA blocks the cloud sign-in**, ask Tech Help / IT for:
- Read-only access to `…/Worldpay/WP Weekly Reports` for a service account **or**
- An Entra **app registration** with Sites.Selected (or equivalent) on that library
- Approval for Cursor / the MCP’s Entra app under Conditional Access

### B. Create the Monday Automation (one-time click)

1. Open [cursor.com/automations/new](https://cursor.com/automations/new)
2. **Trigger → Scheduled**
3. Set cron to: `CRON_TZ=America/Los_Angeles 0 11 * * 1`  
   (Monday 11:00 AM Pacific; Cursor cron is UTC unless `CRON_TZ` is set)
4. **Attach this repository** (`krishnanagavolu-DB/Repo_1`) with write access
5. Enable tools: **the SharePoint MCP** + **repository write access**
6. Paste the **Agent prompt** below into the automation
7. Save / activate
8. Click **Run now** once to prove it can download, certify, and publish Auth + Interchange

Optional: after it exists, store the automation UUID in `config/sharepoint-source.json`
under `refresh_schedule.automation_id` so agents can look it up with `get-automation`.

### C. After that, weekly ops is hands-off
Michelle drops the two Excels → Monday 11 AM Pacific Automation runs → certification
passes → data pushes to `main` → GitHub Pages updates the same leadership URL.

## Agent prompt (paste into the automation)

```text
Refresh the Dutch Bros In Shop · Worldpay Executive KPI Dashboard.

SharePoint source of truth (do not use another folder):
https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/Worldpay/WP%20Weekly%20Reports?d=w23de4595d91f489fa3c825c6b52e4fcd&csf=1&web=1&e=uSIZpB

Path: sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/Worldpay/WP Weekly Reports
Also read config/sharepoint-source.json and docs/ops/monday-automation.md.

1. List the SharePoint folder. Download this week's newest Auth Summary and
   Interchange Excels (must be a matching pair for the same prior week).

2. Determine prior week Monday (Mon–Sun week the reports cover). Create
   data/raw/{YYYY-MM-DD}/ and save both files there with clear names containing
   Auth and Interchange. Skip if that week folder already exists with both files.

3. Run:
   python3 scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json \
     --site-copy site/data/dashboard.json \
     --site-copy site/preview/data/dashboard.json

4. Certify the final outputs:
   python3 scripts/validate_worldpay.py \
     --raw data/raw \
     --dashboard data/processed/dashboard.json \
     --dashboard site/data/dashboard.json \
     --dashboard site/preview/data/dashboard.json

5. If validation has any ERROR, do NOT publish. If it has WARNING, review and
   explain the movement before publishing. Never suppress a check just to make CI green.

6. This is a certified data-only refresh. Commit directly to main and push so
   GitHub Pages deploys without requiring a person to merge a PR:
   - data/raw/{week}/
   - data/processed/dashboard.json
   - site/data/dashboard.json
   - site/preview/data/dashboard.json (if preview folder exists)
   - data/processed/validation_report.json

Keep commit message like: "data: add Worldpay week YYYY-MM-DD and refresh dashboard"

Before pushing, run `git pull --rebase origin main`. Then push with
`git push origin main`. If the push is rejected because main changed, pull/rebase,
rerun certification, and retry once. Never force-push.

Do not open a PR for a certified weekly data-only refresh. PRs remain required for
code, UI, formulas, validation rules, or automation configuration changes.

If SharePoint auth fails or only one file is present, stop, leave the live dashboard
unchanged, and report the failure clearly.
```

## Failure modes

| Issue | Expected behavior |
|---|---|
| Only one of two files present | Ingest/discover raises; no publish |
| SharePoint auth failure | Automation reports error; prior dashboard remains live |
| Unexpected columns | Investigate before forcing a publish |
| Exact duplicate rows | Certification fails; identify/remove duplicate delivery |
| Numeric/type failure | Certification fails; inspect source workbook formatting |
| Unusual weekly movement | Warning; reconcile against Worldpay totals and explain |
| Published JSON copies differ | Certification fails; regenerate all copies together |

## Local refresh (manual)

```bash
python3 scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json \
  --site-copy site/data/dashboard.json \
  --site-copy site/preview/data/dashboard.json
cd site && python3 -m http.server 8080
```

Open leadership at `http://localhost:8080` and preview at `http://localhost:8080/preview/`.
