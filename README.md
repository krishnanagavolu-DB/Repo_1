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

Drop files in SharePoint `…/Worldpay/WP Weekly Reports`, then let the Monday Cursor Automation run (see [`docs/ops/monday-automation.md`](docs/ops/monday-automation.md)).

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

## Docs

- Design: `docs/superpowers/specs/2026-08-10-dutch-bros-worldpay-executive-kpi-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-08-10-dutch-bros-worldpay-executive-kpi-dashboard.md`
- Monday ops: `docs/ops/monday-automation.md`
