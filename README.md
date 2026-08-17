# Dutch Bros · Payments Executive KPI Dashboard

**In Shop · Worldpay** weekly executive dashboard for company-owned shops.

Built from Worldpay **Auth Summary** + **Interchange** reports. Static site in `site/`, refreshed by ingesting Excels into `site/data/dashboard.json`.

## Share with leadership

1. Merge to `main` and enable **GitHub Pages** (Settings → Pages → Source: **GitHub Actions**).
2. Private repos need **GitHub Pro** for Pages.
3. Share the Pages URL (same link every week after Monday refresh).
4. Only aggregates are published (`site/`). Raw Excels stay in the private repo under `data/raw/`.

## Local preview (Chrome)

```bash
pip install -r requirements.txt
python3 scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json
cd site && python3 -m http.server 8080
```

Open `http://localhost:8080`.

## Weekly update

Drop files in SharePoint [WP Weekly Reports](https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/Worldpay/WP%20Weekly%20Reports?d=w23de4595d91f489fa3c825c6b52e4fcd&csf=1&web=1&e=uSIZpB).  
Monday **11:00 AM Pacific** Cursor Automation refreshes the dashboard (see [`docs/ops/monday-automation.md`](docs/ops/monday-automation.md); source config in [`config/sharepoint-source.json`](config/sharepoint-source.json)).

Manual:

```bash
# put both Excels in data/raw/{prior-week-monday}/
python3 scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json
git add data site/data/dashboard.json && git commit -m "data: refresh Worldpay dashboard" && git push
```

## Tests

```bash
pytest -v
```

## NSO First Tamper Check reminders

Daily decision engine for upcoming shop openings (Outlook drafts for approval — nothing auto-sends in v1).

```bash
python3 scripts/run_nso_reminders.py --dry-run \
  --grid tests/fixtures/nso/sample_grid.xlsx \
  --send-log tests/fixtures/nso/sample_send_log.xlsx \
  --cache tests/fixtures/nso/sample_email_cache.xlsx \
  --out /tmp/nso-dry-run
```

Ops runbook: [`docs/ops/nso-daily-automation.md`](docs/ops/nso-daily-automation.md)  
Config: [`config/nso-source.json`](config/nso-source.json) · email templates: [`config/nso-email-templates/`](config/nso-email-templates/)

## Docs

- Design: `docs/superpowers/specs/2026-08-10-dutch-bros-worldpay-executive-kpi-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-08-10-dutch-bros-worldpay-executive-kpi-dashboard.md`
- Monday ops: `docs/ops/monday-automation.md`
- NSO design: `docs/superpowers/specs/2026-08-17-nso-tamper-check-reminders-design.md`
- NSO plan: `docs/superpowers/plans/2026-08-17-nso-tamper-check-reminders.md`
- NSO daily ops: `docs/ops/nso-daily-automation.md`
