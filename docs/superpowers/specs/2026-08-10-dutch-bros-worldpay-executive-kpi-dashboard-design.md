# Dutch Bros Executive Payments Dashboard — In Shop · Worldpay

**Date:** 2026-08-10  
**Status:** Approved for implementation planning  
**Audience:** Executives + payments/finance ops  
**Channel (v1):** In Shop · Worldpay (company-owned shops only)

---

## 1. Goal

Build a shareable **Executive KPI Dashboard** from Worldpay weekly Auth Summary and Interchange reports so leadership can monitor in-shop payment health and cost without manual pivots.

v1 is the first tab in a multi-channel **Payments** dashboard series. Later tabs (Olo Pay, Gift Cards, Other) are visible as Coming soon.

---

## 2. Decisions locked

| Topic | Decision |
|---|---|
| Audience | Exec summary + ops drill charts (option C) |
| Hosting | Private GitHub repo + GitHub Pages (obscure public URL) |
| Raw data | Stay private (SharePoint + private repo); Pages publishes aggregates only |
| Drop zone | SharePoint `…/Worldpay/WP Weekly Reports` |
| Weekly refresh | Scheduled Cursor Automation (Monday cron) |
| SharePoint auth | User OAuth first; app registration fallback if Conditional Access blocks |
| Build approach | Static HTML/CSS/JS dashboard + Python ETL → `dashboard.json` |
| Brand | Dutch Bros site tokens: blue `#005F98` / `#006098`, red `#D7282F`, yellow `#FDE021`, dark `#021521`, Futura PT, official logo SVG |
| Browser target | Chrome desktop primary |

---

## 3. Architecture & weekly data flow

```text
SharePoint: WP Weekly Reports
  (Auth Summary + Interchange Excels)
        │
        ▼  Monday Cursor Automation
Cloud Agent
  1. Auth to Microsoft (OAuth → app-reg fallback)
  2. Pull new/changed week files
  3. Store under data/raw/{week_start}/
  4. Run pipeline → data/processed/dashboard.json
  5. Commit + push → GitHub Pages rebuilds
        │
        ▼
Stable obscure Pages URL (same link every week)
```

**Boundaries**
- SharePoint = human drop zone / source of truth for incoming files  
- Private GitHub repo = raw history + pipeline + site source  
- GitHub Pages = aggregated KPI JSON + static UI only  
- Cursor Automation = Monday operator (no weekly coding from stakeholders)

**Prerequisites**
- GitHub Pro (or equivalent) for Pages from a private repo  
- Microsoft access for the automation to read the SharePoint folder  

---

## 4. Source reports

Two Worldpay custom reports per week (prior Mon–Sun):

1. **Auth Summary** — Network, Entry Mode, Mobile Wallet, Auth Response code/desc, Auth Request Cnt, Authorization $  
2. **Interchange** — Card Type, SALE/RETURN, Entry Mode, Mobile Wallet Desc, Interchange program, Surcharge Reason, Transaction Cnt, Transaction Amt, Interchange Fee  

Sample history: 3 weeks (Jul 20–26, Jul 27–Aug 2, Aug 3–9, 2026). Trends show available weeks until 4+ exist; history grows up to 12 months retained in processed data.

---

## 5. Data cleanup

| Rule | Behavior |
|---|---|
| Wallet casing | Canonical title case (e.g. Apple Pay) |
| Blank / `.` wallets | Card / Other |
| Numeric / junk wallet IDs | Other wallet |
| Network names | Align Auth `MC` ↔ Interchange `MASTERCARD` → Mastercard |
| Week key | Prior Mon–Sun, labeled by week-start date |

---

## 6. KPI definitions (In Shop · Worldpay)

| Tile / chart | Formula | Source |
|---|---|---|
| **Auth rate** | Approve (`Auth Response cd = 00`) count ÷ total auth request count | Auth |
| **AOV** | SALE amount ÷ SALE count | Interchange |
| **Returns as % of sales** | RETURN amount ÷ SALE amount | Interchange |
| **Sales volume** | SALE `Transaction Amt` | Interchange |
| **Transaction volume** | SALE `Transaction Cnt` | Interchange |
| **IC rate** (rightmost) | SALE `Interchange Fee` ÷ SALE `Transaction Amt` | Interchange |
| **Entry method mix** | SALE count % by entry mode: Contactless `07`, Chip/Dip `05`, Swipe `90`, Key `01`, Other | Interchange (or Auth) |
| **Payment type mix** | SALE count % by card brand (Visa / Mastercard / Discover / Amex) | Interchange |
| **Decline reasons** | Non-approve auth counts by `Auth Response` (horizontal bars) | Auth |

**WoW behavior**
- Each KPI shows ▲/▼ vs prior week  
- **Down arrows always include the numeric delta** (e.g. `▼ −$4.1M`)  
- Each KPI card includes a **4-week line trend** (fewer points until history exists)  
- Period control supports individual weeks **and YTD** (aggregate all loaded weeks in the current calendar year)

**Explicit proxies / limits**
- IC rate is interchange-only (not full merchant cost of acceptance)  
- Downgrade/surcharge analysis may appear in ops detail later; not a top tile in the approved mock  

**Coming soon (In Shop metrics, not channel tabs)**
- Authorization latency  
- False decline / retry success  
- Chargebacks (ratio / win-loss)  

Do not invent numbers for these.

**Out of scope for v1**
- Metric click-through popup with 12-month drill (proposed then reverted)  
- Live BI tool embedding  

---

## 7. UI / UX

### Shell
- Dutch Bros logo + “Payments / Executive KPI Dashboard”  
- **Period control top-right:** week dropdown including **YTD**  
- Quiet subtitle: **Company owned shops only**  
- **Channel tabs:** In Shop (Worldpay) active; Olo Pay, Gift Cards, Other = Coming soon  

### In Shop body (approved layout)
- Section title: In Shop performance  
- **3×2 KPI grid** — each card: label, large value, WoW delta (value on down arrows), in-card 4-week line trend  
- Order: Auth rate · AOV · Returns as % of sales · Sales volume · Transaction volume · **IC rate** (bottom-right)  
- Below: Entry method mix (pie) · Payment type mix (pie)  
- Decline reasons (horizontal bar chart), full width  
- Coming soon metric tiles  

### Visual system
- Background cool light blue-gray (`#f5f8fc` / `#eef6ff` family)  
- Primary text `#021521`, accent blue `#005F98`, alert red `#D7282F`, highlight yellow `#FDE021`  
- Chrome desktop first; page may scroll  
- No “last week” in chart titles (period is global)

---

## 8. Repo shape (implementation target)

```text
data/raw/{YYYY-MM-DD}/          # private raw Excels per week
data/processed/dashboard.json   # aggregates for the site
scripts/ingest_worldpay.py      # cleanup + KPI build
docs/superpowers/specs/…        # this design
site/ or docs/                  # static dashboard for Pages
.github/workflows/pages.yml     # optional Pages deploy
```

Automation prompt (Monday): pull SharePoint → ingest → commit processed JSON + any site regen → push.

---

## 9. Sharing with leadership

1. Enable **GitHub Pages** on the private repo (requires GitHub Pro for private source).  
2. Share the **Pages URL** (obscure public link). Anyone with the link can view; raw Excels are not on the public site.  
3. After each Monday automation, the **same URL** updates — no resending files.  
4. Optional: pin the link in Teams/email with one-line context: “Dutch Bros Payments · In Shop Worldpay KPIs (company-owned).”

**Note:** Private repo ≠ private website. Pages is public-by-URL unless Enterprise private Pages is available. Obscure URL + aggregate-only publish is the accepted risk for v1.

---

## 10. Error handling & ops

| Case | Behavior |
|---|---|
| Missing one of the two weekly files | Fail ingest for that week; automation reports error; prior dashboard remains |
| Wallet / network unknown values | Map to Other; log unmapped values |
| SharePoint auth failure | Surface in automation run; do not partially publish corrupt JSON |
| YTD with partial year | Sum all loaded weeks in current calendar year; label period as YTD |

---

## 11. Success criteria

- Leadership opens one stable link and sees current week + WoW + 4-week trends  
- Monday drop in SharePoint → dashboard updates without stakeholder coding  
- In Shop clearly labeled as Worldpay / company-owned; other channels reserved as tabs  
- Brand matches Dutch Bros site colors/logo  

---

## 12. Next step

Create an implementation plan (`writing-plans`) from this spec, then build the static site, ingest pipeline, Pages hosting, and Cursor Automation wiring.
