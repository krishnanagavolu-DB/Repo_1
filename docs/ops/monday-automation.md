# Monday automation — Worldpay In Shop dashboard refresh

## What happens each week

1. Michelle / Worldpay drops two Excels into SharePoint:  
   `Payment Systems/Reports/Worldpay/WP Weekly Reports`
2. A **Cursor Automation** (Monday cron) pulls the new files into this repo.
3. Ingest validates raw files, rebuilds `data/processed/dashboard.json`, and copies it to:
   - `site/data/dashboard.json` (leadership homepage)
   - `site/preview/data/dashboard.json` (preview page, if present)
4. Certification checks the output copies and writes `data/processed/validation_report.json`.
5. Push to `main` triggers GitHub Pages deploy; CI runs the certification again and blocks bad data.
6. Leadership opens the **same Pages URL** — no new link needed.
   Preview UI work stays at `/preview/` until promoted (see `docs/ops/preview-workflow.md`).

## One-time setup

### GitHub Pages
1. Repo **Settings → Pages → Source: GitHub Actions**
2. Private repo Pages requires **GitHub Pro** (or org Team+)
3. After first deploy, share the Pages URL with leadership

### Cursor Automation
1. Create an automation at [cursor.com/automations](https://cursor.com/automations)
2. Trigger: **Scheduled** — every Monday (after reports usually land)
3. Attach this repository
4. Enable tools needed for SharePoint/Microsoft access (OAuth first)
5. Use the prompt below

### SharePoint auth
1. Prefer **your Dutch Bros Microsoft login (OAuth)** when the automation first runs
2. If Conditional Access blocks Cursor cloud IPs, ask IT for an **app registration** with read-only access to the WP Weekly Reports folder
3. Store secrets in Cursor automation secrets if using app credentials

## Agent prompt (paste into the automation)

```text
Refresh the Dutch Bros In Shop · Worldpay Executive KPI Dashboard.

1. From SharePoint folder
   "sites/CoreShopTech/Shared Documents/General/Payment Systems/Reports/Worldpay/WP Weekly Reports"
   download this week's Auth Summary and Interchange Excels (newest pair).

2. Determine prior week Monday (Mon–Sun week the reports cover). Create
   data/raw/{YYYY-MM-DD}/ and save both files there with clear names containing
   Auth and Interchange.

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

6. Commit and push to main so GitHub Pages updates:
   - data/raw/{week}/
   - data/processed/dashboard.json
   - site/data/dashboard.json
   - site/preview/data/dashboard.json (if preview folder exists)
   - data/processed/validation_report.json

Keep commit message like: "data: add Worldpay week YYYY-MM-DD and refresh dashboard"
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
