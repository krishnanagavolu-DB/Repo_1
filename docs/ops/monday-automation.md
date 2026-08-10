# Monday automation — Worldpay In Shop dashboard refresh

## What happens each week

1. Michelle / Worldpay drops two Excels into SharePoint:  
   `Payment Systems/Reports/Worldpay/WP Weekly Reports`
2. A **Cursor Automation** (Monday cron) pulls the new files into this repo.
3. Ingest rebuilds `data/processed/dashboard.json` and copies it to `site/data/dashboard.json`.
4. Push to `main` triggers GitHub Pages deploy of the `site/` folder only.
5. Leadership opens the **same Pages URL** — no new link needed.

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
   python3 scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json

4. If either file is missing or ingest fails, do NOT publish partial data. Report the error and stop.

5. Commit and push to main so GitHub Pages updates:
   - data/raw/{week}/
   - data/processed/dashboard.json
   - site/data/dashboard.json

Keep commit message like: "data: add Worldpay week YYYY-MM-DD and refresh dashboard"
```

## Failure modes

| Issue | Expected behavior |
|---|---|
| Only one of two files present | Ingest/discover raises; no publish |
| SharePoint auth failure | Automation reports error; prior dashboard remains live |
| Unexpected columns | Investigate before forcing a publish |

## Local refresh (manual)

```bash
python3 scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json
cd site && python3 -m http.server 8080
```

Open `http://localhost:8080` in Chrome.
