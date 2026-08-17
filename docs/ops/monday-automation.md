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
5. Push / merge to `main` triggers GitHub Pages deploy; CI runs the certification again and blocks bad data.
6. Leadership opens the **same Pages URL** — no new link needed.
   Preview UI work stays at `/preview/` until promoted (see `docs/ops/preview-workflow.md`).

## One-time setup (you must click this — agents cannot create Automations)

### GitHub Pages
1. Repo **Settings → Pages → Source: GitHub Actions**
2. Private repo Pages requires **GitHub Pro** (or org Team+)
3. After first deploy, share the Pages URL with leadership

### Cursor Automation
1. Open [cursor.com/automations/new](https://cursor.com/automations/new)
2. **Trigger → Scheduled**
3. Set cron to: `CRON_TZ=America/Los_Angeles 0 11 * * 1`  
   (Monday 11:00 AM Pacific; Cursor cron is UTC unless `CRON_TZ` is set)
4. **Attach this repository** (`krishnanagavolu-db/repo_1`) so the agent can commit/PR
5. Enable tools needed for SharePoint / Microsoft Graph access (OAuth first)
6. Paste the **Agent prompt** below into the automation
7. Save / activate

Optional: after it exists, store the automation UUID in `config/sharepoint-source.json` under `refresh_schedule.automation_id` so agents can look it up with `get-automation`.

### SharePoint auth
1. Prefer **your Dutch Bros Microsoft login (OAuth)** when the automation first runs
2. If Conditional Access blocks Cursor cloud IPs, ask IT for an **app registration** with read-only access to the WP Weekly Reports folder
3. Store secrets in Cursor automation secrets if using app credentials

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

6. Commit, push a branch cursor/data-week-YYYY-MM-DD-8ee2, and open/update a PR into main:
   - data/raw/{week}/
   - data/processed/dashboard.json
   - site/data/dashboard.json
   - site/preview/data/dashboard.json (if preview folder exists)
   - data/processed/validation_report.json

Keep commit message like: "data: add Worldpay week YYYY-MM-DD and refresh dashboard"

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
