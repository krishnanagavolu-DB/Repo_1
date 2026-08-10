# Dutch Bros In Shop · Worldpay Executive KPI Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Chrome-friendly static Executive KPI Dashboard for In Shop · Worldpay data, refreshed weekly from SharePoint via Cursor Automation into a stable GitHub Pages URL.

**Architecture:** Python ETL normalizes Auth + Interchange Excels into `data/processed/dashboard.json`. A static `site/` app (HTML/CSS/JS + Chart.js) renders the approved 3×2 KPI layout. GitHub Actions deploys **only** `site/` to Pages so raw Excels never go public. Monday Cursor Automation pulls SharePoint → raw → ingest → commit → Pages updates.

**Tech Stack:** Python 3.12, pandas, openpyxl, pytest; static HTML/CSS/JS; Chart.js 4.x CDN; GitHub Pages (Actions); Dutch Bros brand tokens from spec.

**Spec:** `docs/superpowers/specs/2026-08-10-dutch-bros-worldpay-executive-kpi-dashboard-design.md`

## Global Constraints

- Channel v1 label: **In Shop · Worldpay**; scope line: **Company owned shops only**
- KPI tile order: Auth rate · AOV · Returns as % of sales · Sales volume · Transaction volume · **IC rate** (bottom-right)
- Down arrows must show numeric delta values; trends are **line charts** inside each KPI card (up to 4 weeks on cards)
- Chart titles must **not** say “last week”; period is controlled globally (week list + **YTD**)
- Brand colors: blue `#005F98` / `#006098`, red `#D7282F`, yellow `#FDE021`, dark `#021521`
- Publish **aggregates only** via Pages; never deploy `data/raw/`
- Coming soon (metrics): Auth latency, False decline/retry, Chargebacks — no fake numbers
- Coming soon (tabs): Olo Pay, Gift Cards, Other — disabled
- Chrome desktop primary; page may scroll

## File structure

| Path | Responsibility |
|---|---|
| `requirements.txt` | Python deps |
| `src/worldpay_dashboard/normalize.py` | Wallet/network/entry-mode cleanup + week dating |
| `src/worldpay_dashboard/kpis.py` | Per-week and multi-week KPI aggregation |
| `src/worldpay_dashboard/ingest.py` | Read raw Excels → write `dashboard.json` |
| `scripts/ingest_worldpay.py` | CLI entrypoint |
| `tests/test_normalize.py` | Cleanup unit tests |
| `tests/test_kpis.py` | KPI formula tests |
| `tests/test_ingest.py` | End-to-end ingest on fixture week |
| `tests/fixtures/mini_auth.csv` / `mini_ix.csv` | Tiny fixtures (no need for full Excel in unit tests) |
| `data/raw/{YYYY-MM-DD}/` | Private weekly Excels |
| `data/processed/dashboard.json` | Canonical aggregates (also copied into `site/data/`) |
| `site/index.html` | Dashboard shell + markup |
| `site/css/dashboard.css` | Brand + layout |
| `site/js/dashboard.js` | Load JSON, period switch, charts |
| `site/assets/dutchbros-logo.svg` | Logo |
| `site/data/dashboard.json` | Published copy of processed JSON |
| `.github/workflows/deploy-pages.yml` | Deploy `site/` only |
| `docs/ops/monday-automation.md` | Cursor Automation + SharePoint setup |
| `README.md` | Stakeholder how-to + share link |

---

### Task 1: Project scaffold + normalize module (TDD)

**Files:**
- Create: `requirements.txt`
- Create: `pyproject.toml` or `pytest.ini` (pytest path `src`)
- Create: `src/worldpay_dashboard/__init__.py`
- Create: `src/worldpay_dashboard/normalize.py`
- Create: `tests/test_normalize.py`

**Interfaces:**
- Produces:
  - `normalize_wallet(value: object) -> str`
  - `normalize_network(value: object) -> str`
  - `normalize_entry_method(code: object) -> str`  # Contactless|Chip / Dip|Swipe|Key entered|Other
  - `week_start_from_report_stamp(stamp: str) -> str`  # `YYYYMMDD` delivery → prior Monday `YYYY-MM-DD`
  - `canonical_card_brand(value: object) -> str`

- [ ] **Step 1: Add dependencies and pytest config**

```text
requirements.txt:
pandas>=2.2
openpyxl>=3.1
pytest>=8.0
```

```ini
# pytest.ini
[pytest]
pythonpath = src
testpaths = tests
```

- [ ] **Step 2: Write failing normalize tests**

```python
# tests/test_normalize.py
from worldpay_dashboard.normalize import (
    normalize_wallet,
    normalize_network,
    normalize_entry_method,
    week_start_from_report_stamp,
    canonical_card_brand,
)

def test_wallet_casing_and_blanks():
    assert normalize_wallet("APPLE PAY") == "Apple Pay"
    assert normalize_wallet("Apple Pay") == "Apple Pay"
    assert normalize_wallet(None) == "Card / Other"
    assert normalize_wallet(".") == "Card / Other"
    assert normalize_wallet("40010080419") == "Other wallet"

def test_network_alignment():
    assert normalize_network("MC") == "Mastercard"
    assert normalize_network("MASTERCARD") == "Mastercard"
    assert normalize_network("VISA") == "Visa"

def test_entry_methods():
    assert normalize_entry_method("07") == "Contactless"
    assert normalize_entry_method(5) == "Chip / Dip"
    assert normalize_entry_method("90") == "Swipe"
    assert normalize_entry_method("01") == "Key entered"

def test_week_start_from_monday_delivery():
    # Report stamped 20260810 (Mon) → prior week Mon 2026-08-03
    assert week_start_from_report_stamp("20260810") == "2026-08-03"
    assert week_start_from_report_stamp("20260804") == "2026-07-27"
    assert week_start_from_report_stamp("20260730") == "2026-07-20"

def test_card_brand():
    assert canonical_card_brand("VISA") == "Visa"
    assert canonical_card_brand("AMEX") == "Amex"
```

- [ ] **Step 3: Run tests — expect FAIL**

Run: `pip install -r requirements.txt && pytest tests/test_normalize.py -v`  
Expected: FAIL (module/functions missing)

- [ ] **Step 4: Implement `normalize.py`**

```python
# src/worldpay_dashboard/normalize.py
from __future__ import annotations
from datetime import datetime, timedelta
import re

_WALLET_CANON = {
    "apple pay": "Apple Pay",
    "android pay (google)": "Android Pay (Google)",
    "samsung pay": "Samsung Pay",
    "garmin pay": "Garmin Pay",
    "fitbit": "Fitbit",
    "bronco": "Bronco",
}

_NETWORK = {
    "mc": "Mastercard",
    "mastercard": "Mastercard",
    "visa": "Visa",
    "amex": "Amex",
    "discover": "Discover",
}

_ENTRY = {
    "7": "Contactless",
    "07": "Contactless",
    "5": "Chip / Dip",
    "05": "Chip / Dip",
    "90": "Swipe",
    "1": "Key entered",
    "01": "Key entered",
}

def normalize_wallet(value: object) -> str:
    if value is None:
        return "Card / Other"
    s = str(value).strip()
    if s == "" or s == ".":
        return "Card / Other"
    if re.fullmatch(r"\d+", s):
        return "Other wallet"
    key = s.lower()
    if key in _WALLET_CANON:
        return _WALLET_CANON[key]
    return s.title()

def normalize_network(value: object) -> str:
    if value is None:
        return "Other"
    key = str(value).strip().lower()
    return _NETWORK.get(key, str(value).strip().title())

def normalize_entry_method(code: object) -> str:
    if code is None:
        return "Other"
    key = str(code).strip()
    if key.isdigit():
        key = str(int(key))  # 07 -> 7 for lookup; also try zero-padded
    return _ENTRY.get(str(code).strip(), _ENTRY.get(key, "Other"))

def week_start_from_report_stamp(stamp: str) -> str:
    delivery = datetime.strptime(stamp, "%Y%m%d").date()
    # Prior calendar week Mon–Sun relative to delivery Monday (or nearest logic):
    # Spec samples: stamp on/near Monday → prior Monday is delivery - 7 days when delivery is Monday.
    # Normalize to Monday of delivery week, then subtract 7 days.
    monday_of_delivery_week = delivery - timedelta(days=delivery.weekday())
    prior_monday = monday_of_delivery_week - timedelta(days=7)
    return prior_monday.isoformat()

def canonical_card_brand(value: object) -> str:
    return normalize_network(value)
```

- [ ] **Step 5: Run tests — expect PASS**

Run: `pytest tests/test_normalize.py -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add requirements.txt pytest.ini src/worldpay_dashboard tests/test_normalize.py
git commit -m "feat: add Worldpay normalize helpers with tests"
```

---

### Task 2: KPI aggregation (TDD)

**Files:**
- Create: `src/worldpay_dashboard/kpis.py`
- Create: `tests/test_kpis.py`
- Create: `tests/fixtures/mini_auth.csv`
- Create: `tests/fixtures/mini_ix.csv`

**Interfaces:**
- Consumes: normalize helpers from Task 1
- Produces:
  - `compute_week_kpis(auth_df, ix_df, week_start: str) -> dict`
  - `build_dashboard_payload(weeks: list[dict]) -> dict`  # includes periods, ytd, trends

Fixture CSV columns must match real Excel headers used in ingest.

- [ ] **Step 1: Create mini fixtures**

`mini_auth.csv`:
```csv
Network,Entry Mode,Mobile Wallet,Auth Response cd,Auth Response,Auth Request Cnt,Authorization
VISA,07,APPLE PAY,00,Approved or completed successfully,90,900
VISA,07,,05,Do not honor,10,100
MC,05,,00,Approved or completed successfully,50,500
```

`mini_ix.csv`:
```csv
Card Type,Transaction,Entry Mode,Mobile Wallet Desc,Surcharge Reason,Transaction Cnt,Transaction Amt,Interchange Fee
VISA,SALE,07,APPLE PAY,.,80,1000,20
VISA,RETURN,07,APPLE PAY,.,2,10,0
MASTERCARD,SALE,05,,.,20,400,10
```

- [ ] **Step 2: Write failing KPI tests**

```python
# tests/test_kpis.py
import pandas as pd
from pathlib import Path
from worldpay_dashboard.kpis import compute_week_kpis, build_dashboard_payload

FIX = Path(__file__).parent / "fixtures"

def _frames():
    auth = pd.read_csv(FIX / "mini_auth.csv")
    ix = pd.read_csv(FIX / "mini_ix.csv")
    return auth, ix

def test_auth_rate_and_aov_and_ic():
    auth, ix = _frames()
    week = compute_week_kpis(auth, ix, "2026-08-03")
    assert week["kpis"]["auth_rate"] == 140 / 150
    assert round(week["kpis"]["aov"], 4) == round(1400 / 100, 4)
    assert week["kpis"]["sales_volume"] == 1400
    assert week["kpis"]["transaction_volume"] == 100
    assert week["kpis"]["returns_pct_of_sales"] == 10 / 1400
    assert week["kpis"]["ic_rate"] == 30 / 1400

def test_mixes_and_declines():
    auth, ix = _frames()
    week = compute_week_kpis(auth, ix, "2026-08-03")
    assert week["entry_method_mix"][0]["label"] == "Contactless"
    assert week["payment_type_mix"][0]["label"] == "Visa"
    assert any(d["label"] == "Do not honor" for d in week["decline_reasons"])

def test_payload_periods_and_ytd():
    auth, ix = _frames()
    w1 = compute_week_kpis(auth, ix, "2026-07-20")
    w2 = compute_week_kpis(auth, ix, "2026-08-03")
    payload = build_dashboard_payload([w1, w2])
    assert payload["meta"]["channel"] == "In Shop · Worldpay"
    assert payload["meta"]["scope"] == "Company owned shops only"
    assert "ytd" in payload["periods"]
    assert len(payload["periods"]["weeks"]) == 2
```

- [ ] **Step 3: Run — expect FAIL**

Run: `pytest tests/test_kpis.py -v`  
Expected: FAIL

- [ ] **Step 4: Implement `kpis.py`**

Implement `compute_week_kpis` using normalize helpers:
- Auth rate = sum(cnt where cd == "00") / sum(cnt)
- Sales metrics from `Transaction == "SALE"`
- Returns % = return amt / sale amt (0 if sale amt 0)
- IC rate = sale fee / sale amt
- Entry method mix from SALE rows, percentages of count
- Payment type mix from SALE card brand
- Decline reasons: auth rows where cd != "00", top reasons by count descending

`build_dashboard_payload(weeks)`:
- Sort weeks by `week_start`
- For each KPI, attach `history` list of `{week_start, value}` (all weeks, UI shows last 4 on cards)
- Compute WoW delta vs previous week when present
- Build `periods.ytd` by summing volume metrics and recomputing rates from summed numerators/denominators for current calendar year weeks
- Include `meta`: channel, scope, generated_at, brand colors

Exact JSON shape (lock this; site depends on it):

```json
{
  "meta": {
    "channel": "In Shop · Worldpay",
    "scope": "Company owned shops only",
    "generated_at": "ISO-8601",
    "brand": {"blue": "#005F98", "red": "#D7282F", "yellow": "#FDE021", "dark": "#021521"}
  },
  "periods": {
    "weeks": [
      {
        "id": "2026-08-03",
        "label": "Aug 3 – Aug 9, 2026",
        "week_start": "2026-08-03",
        "week_end": "2026-08-09",
        "kpis": {
          "auth_rate": {"value": 0.9871, "delta": 0.0011, "history": [{"week_start":"…","value":…}]},
          "aov": {"value": 12.18, "delta": -0.04, "history": []},
          "returns_pct_of_sales": {"value": 0.001, "delta": -0.0001, "history": []},
          "sales_volume": {"value": 28300000, "delta": -4100000, "history": []},
          "transaction_volume": {"value": 2320000, "delta": -295000, "history": []},
          "ic_rate": {"value": 0.0194, "delta": 0.0002, "history": []}
        },
        "entry_method_mix": [{"label": "Contactless", "pct": 0.946, "count": 1}],
        "payment_type_mix": [{"label": "Visa", "pct": 0.752, "count": 1}],
        "decline_reasons": [{"label": "Decline", "count": 20648}]
      }
    ],
    "ytd": { "id": "ytd", "label": "YTD", "kpis": {}, "entry_method_mix": [], "payment_type_mix": [], "decline_reasons": [] }
  }
}
```

- [ ] **Step 5: Run — expect PASS**

Run: `pytest tests/test_kpis.py -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/worldpay_dashboard/kpis.py tests/test_kpis.py tests/fixtures
git commit -m "feat: compute Worldpay weekly KPIs and dashboard payload"
```

---

### Task 3: Ingest CLI + load sample weeks

**Files:**
- Create: `src/worldpay_dashboard/ingest.py`
- Create: `scripts/ingest_worldpay.py`
- Create: `tests/test_ingest.py`
- Create: `data/raw/2026-07-20/`, `data/raw/2026-07-27/`, `data/raw/2026-08-03/` (copy uploads)
- Create: `data/processed/.gitkeep`
- Modify: `.gitignore` if needed (do **not** ignore `data/raw` — private repo keeps history; Pages must not publish it)

**Interfaces:**
- Produces: `ingest_raw_tree(raw_root: Path, out_json: Path) -> Path`
- CLI: `python scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json`

- [ ] **Step 1: Write ingest test with temp raw tree of CSV renamed logic OR mock Excel**

Prefer: unit-test `discover_weeks(raw_root)` pairing files by folder name `YYYY-MM-DD` containing `*Auth*` and `*Interchange*`.

```python
def test_discover_weeks_requires_both_files(tmp_path):
    week = tmp_path / "2026-08-03"
    week.mkdir()
    (week / "Auth_Summary.xlsx").write_bytes(b"PK")  # incomplete pair
    from worldpay_dashboard.ingest import discover_weeks
    import pytest
    with pytest.raises(ValueError, match="missing"):
        discover_weeks(tmp_path)
```

Also test happy-path discover when both files exist (can touch empty files for discover-only).

- [ ] **Step 2: Implement ingest**

- `discover_weeks`: each subdir of `data/raw` named `YYYY-MM-DD` must contain one Auth and one Interchange xlsx; else raise clear error
- Read with `pandas.read_excel`
- `compute_week_kpis` per week → `build_dashboard_payload` → write JSON (pretty, stable key order)
- Copy/write to `site/data/dashboard.json` when `--site-copy` provided

- [ ] **Step 3: Copy the 3 sample Excel pairs into raw weeks**

```bash
mkdir -p data/raw/2026-07-20 data/raw/2026-07-27 data/raw/2026-08-03
cp uploads/...20260730*Auth* data/raw/2026-07-20/
cp uploads/...20260730*Interchange* data/raw/2026-07-20/
# similarly for 20260804 → 2026-07-27 and 20260810 → 2026-08-03
```

Use actual upload paths under `/home/ubuntu/.cursor/projects/workspace/uploads/`.

- [ ] **Step 4: Run ingest and verify JSON**

```bash
python scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json
python -c "import json; d=json.load(open('data/processed/dashboard.json')); assert len(d['periods']['weeks'])==3; print(d['periods']['weeks'][-1]['label'], d['periods']['weeks'][-1]['kpis']['auth_rate']['value'])"
```

Expected: 3 weeks; latest week auth rate ~0.987

- [ ] **Step 5: Commit**

```bash
git add src/worldpay_dashboard/ingest.py scripts/ingest_worldpay.py tests/test_ingest.py data site/data/dashboard.json
git commit -m "feat: ingest Worldpay Excels into dashboard.json"
```

---

### Task 4: Static site shell (brand + layout markup)

**Files:**
- Create: `site/index.html`
- Create: `site/css/dashboard.css`
- Create: `site/assets/dutchbros-logo.svg` (from dutchbros.com footer logo already scraped, or re-download)
- Create: `site/js/dashboard.js` (stub that loads JSON and fills text KPIs first)

**Interfaces:**
- Consumes: `site/data/dashboard.json` shape from Task 2
- Produces: renderable page matching approved 3×2 layout

- [ ] **Step 1: Add logo asset**

Copy `/workspace/.superpowers/brainstorm/.../dutchbros-logo.svg` → `site/assets/dutchbros-logo.svg` (or curl from `https://www.dutchbros.com/_nuxt/footer_logo.BHNikE1L.svg`).

- [ ] **Step 2: Build `index.html` structure**

Required regions (IDs stable for JS):
- `#period-select` — `<select>` options filled from JSON weeks + YTD
- Channel tabs: In Shop active; Olo Pay / Gift Cards / Other disabled with “Coming soon”
- `#kpi-grid` — 6 articles in order listed in Global Constraints
- `#chart-entry`, `#chart-payment`, `#chart-declines`
- `#coming-soon` row

Copy labels exactly: **Returns as % of sales**, **Company owned shops only**, **In Shop** / **Worldpay**.

- [ ] **Step 3: CSS for Chrome desktop**

Implement the approved visual system:
- max-width ~1120–1200px centered
- 3×2 KPI grid, card with label / value+delta row / in-card trend canvas
- Futura via Adobe Typekit if acceptable; fallback: `"Futura PT", "Segoe UI", system-ui, sans-serif`
- Colors from brand tokens

- [ ] **Step 4: JS — load JSON + period switching (KPIs text first)**

```javascript
// site/js/dashboard.js (core)
async function loadDashboard() {
  const res = await fetch('data/dashboard.json', { cache: 'no-store' });
  const data = await res.json();
  populatePeriodSelect(data);
  renderPeriod(data, selectedPeriodId(data));
}
```

WoW delta formatting: if delta < 0 for display arrow purposes use ▼ and show signed value; for IC rate increase may be “bad” but still show ▼/+ per product rule “down arrow shows value” — show arrow by sign of delta, always include formatted magnitude.

- [ ] **Step 5: Manual Chrome check**

Run: `cd site && python -m http.server 8080`  
Open `http://localhost:8080` — verify header, tabs, 6 aligned cards, period select includes YTD.

- [ ] **Step 6: Commit**

```bash
git add site
git commit -m "feat: add branded In Shop dashboard shell"
```

---

### Task 5: Charts (Chart.js line + pie + bar)

**Files:**
- Modify: `site/index.html` (Chart.js CDN)
- Modify: `site/js/dashboard.js`

**Interfaces:**
- Consumes: period object `kpis.*.history`, mixes, decline_reasons

- [ ] **Step 1: Add Chart.js 4 CDN to `index.html`**

- [ ] **Step 2: Implement in-card line trends**

For each KPI, render last up to 4 history points as a line chart (no legend, minimal ticks). Destroy/recreate on period change.

- [ ] **Step 3: Implement Entry method + Payment type doughnuts/pies with % legends**

- [ ] **Step 4: Implement Decline reasons horizontal bar chart**

- [ ] **Step 5: Verify YTD**

Select YTD — KPI values update from `periods.ytd`; mixes/declines update; trends still show weekly history where provided.

- [ ] **Step 6: Commit**

```bash
git add site/index.html site/js/dashboard.js
git commit -m "feat: render KPI trends and mix/decline charts"
```

---

### Task 6: GitHub Pages deploy (site/ only)

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `README.md` with enablement steps

- [ ] **Step 1: Add workflow**

```yaml
name: Deploy dashboard to GitHub Pages
on:
  push:
    branches: [main]
    paths: ["site/**", ".github/workflows/deploy-pages.yml"]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: site
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Document in README**

Include:
1. Repo Settings → Pages → Source: GitHub Actions  
2. Requires GitHub Pro for private repo Pages  
3. Share the Pages URL with leadership  
4. Weekly: files land in SharePoint; automation updates `site/data/dashboard.json`

- [ ] **Step 3: Merge path note**

Implementation branch should PR to `main` so Pages deploys from `main`. Until Pro/Pages enabled, `python -m http.server` in `site/` is the local share workaround (screenshot/PDF if needed).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy-pages.yml README.md
git commit -m "ci: deploy site/ folder to GitHub Pages"
```

---

### Task 7: Monday automation runbook + ingest docs

**Files:**
- Create: `docs/ops/monday-automation.md`
- Modify: `README.md` (link to runbook)

- [ ] **Step 1: Write runbook covering**

1. SharePoint folder URL (WP Weekly Reports)  
2. Create Cursor Automation: Monday cron, attach this repo  
3. Prompt text for the agent:

```text
Pull this week's Dutch Bros Worldpay Auth Summary and Interchange Excels from the SharePoint folder
"Payment Systems/Reports/Worldpay/WP Weekly Reports".
Save them under data/raw/{prior_week_monday}/ with clear filenames.
Run: python scripts/ingest_worldpay.py --raw data/raw --out data/processed/dashboard.json --site-copy site/data/dashboard.json
Commit and push to main so GitHub Pages updates.
If a file pair is incomplete, do not publish; report the error.
```

4. Auth: Microsoft OAuth first; if blocked, IT app registration with read to that folder  
5. Failure modes from spec (missing file, auth error)

- [ ] **Step 2: Commit**

```bash
git add docs/ops/monday-automation.md README.md
git commit -m "docs: add Monday SharePoint automation runbook"
```

---

### Task 8: End-to-end verification

**Files:** none new (verification only)

- [ ] **Step 1: Re-run full test suite**

```bash
pytest -v
```

Expected: all PASS

- [ ] **Step 2: Re-ingest and spot-check latest week vs known sample**

Latest week `2026-08-03`: auth rate ≈ 98.71%, sales volume ≈ $28.3M, IC rate ≈ 1.94%

- [ ] **Step 3: Visual pass in Chrome**

Check: tabs, period+YTD on right, scope line, 3×2 cards aligned, line trends, pies, decline bars, coming soon rows, no “last week” in titles

- [ ] **Step 4: Confirm `site/` has no Excels**

```bash
find site -name '*.xlsx' | wc -l
```

Expected: `0`

- [ ] **Step 5: Final commit if any fixes; open/update PR; paste Pages URL (or local preview instructions) for Krishna**

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Auth/Interchange ingest + cleanup | 1–3 |
| KPI formulas + Returns as % of sales + txn volume | 2 |
| 3×2 layout, IC rightmost, line trends, down-arrow values | 4–5 |
| Period week + YTD | 2, 4–5 |
| Channel tabs + coming soon metrics | 4 |
| Brand colors/logo | 4 |
| Company owned shops only | 4 |
| Pages aggregates only | 6, 8 |
| SharePoint Monday automation | 7 |
| Leadership shareable link | 6, README |

## Placeholder / consistency self-review

- JSON schema locked in Task 2; Tasks 4–5 consume the same keys  
- Week folder naming `YYYY-MM-DD` = prior Monday throughout  
- No popup/drill-down (explicitly out of v1)  
