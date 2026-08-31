# Olo Pay Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a certified, company-owned-only Olo Pay metrics dashboard to the preview page.

**Architecture:** Preserve one source JSON per completed Monday–Sunday week under `data/raw/olo-pay/`, validate and combine those files with a small Python importer, and publish only the combined file under `site/preview/data/`. A focused browser script normalizes that published JSON and renders a slide-shaped Olo panel with the same period selector used by the other channels.

**Tech Stack:** Python 3.12, JSON, static HTML/CSS/JavaScript, Chart.js, Node smoke tests, pytest.

## Global Constraints

- Olo Pay data must be `processor = Stripe` and company-owned only through `VW_DIM_STORE_CURATED.OWNERSHIP = Company Owned`.
- Franchised and unmapped sales must be exactly zero in every weekly source file.
- Weekly files contain exactly one Monday–Sunday week and must be contiguous with no duplicate week starts.
- Sales, counts, average ticket, authorization rate, brand mix, refunds, and voids come only from the supplied JSON.
- Phase 1 does not infer wallets or decline reasons.
- The new tab and its published JSON exist under `site/preview/` only until the user says `promote`.
- Use official Dutch colors and the existing slide layout.
- Do not display missing-shop or exclusion messaging on the dashboard.

---

### Task 1: Certified Olo weekly data pipeline

**Files:**
- Create: `scripts/import_olo_pay.py`
- Create: `tests/test_import_olo_pay.py`
- Create: `data/raw/olo-pay/olo_pay_methodology.json`
- Create: `data/raw/olo-pay/olo_pay_data_20260615.json` through `olo_pay_data_20260824.json`
- Create: `data/processed/olo_pay_data.json`
- Create: `data/processed/olo_pay_validation_report.json`
- Create: `site/preview/data/olo_pay_data.json`

**Interfaces:**
- Consumes: one methodology JSON and one or more `olo_pay_data_YYYYMMDD.json` files.
- Produces: `validate_week(payload, expected_week) -> list[dict]`, `combine_weekly_files(paths, methodology) -> dict`, and a CLI that writes the processed, validation-report, and preview copies.

- [ ] **Step 1: Write failing Python tests**

Tests must assert that valid CO-only weekly files combine chronologically, output weeks remain source-derived, and the latest week is `2026-08-24`. Separate tests must reject non-Monday dates, incorrect Sunday end dates, multiple weeks per file, duplicate/gapped weeks, non-Stripe data, a shop filter without `Company Owned`, any nonzero franchised/unmapped sales, transaction/order mismatches, incorrect average ticket, incorrect auth-rate math, brand totals that do not reconcile to sales/count, and brand percentages that do not sum to 100%.

- [ ] **Step 2: Verify RED**

Run `python3 -m pytest -q tests/test_import_olo_pay.py`. Expected: failure because `scripts.import_olo_pay` does not exist.

- [ ] **Step 3: Implement the importer**

The CLI accepts repeated weekly paths plus `--methodology`, `--out`, `--report`, and `--preview-copy`. It writes no output if validation has an error. The combined payload keeps definitions, methodology, filter, brand order, shop coverage, all weekly objects, and a generated certification block. The report records status, week count, errors, and warnings.

- [ ] **Step 4: Copy the supplied source files and run import**

Store the uploaded files under `data/raw/olo-pay/` using their canonical names, then run:

```bash
python3 scripts/import_olo_pay.py data/raw/olo-pay/olo_pay_data_*.json \
  --methodology data/raw/olo-pay/olo_pay_methodology.json \
  --out data/processed/olo_pay_data.json \
  --report data/processed/olo_pay_validation_report.json \
  --preview-copy site/preview/data/olo_pay_data.json
```

- [ ] **Step 5: Verify GREEN and commit**

Run `python3 -m pytest -q tests/test_import_olo_pay.py`. Expected: all pass. Commit the pipeline and certified data.

---

### Task 2: Olo Pay preview dashboard

**Files:**
- Create: `site/preview/js/olo-pay.js`
- Create: `tests/olo_pay_smoke.js`
- Modify: `site/preview/index.html`
- Modify: `site/preview/css/dashboard.css`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `site/preview/data/olo_pay_data.json` and the global period selector.
- Produces: `window.__oloPay` helpers for normalization, aggregation, and formatting; `window.__oloPayState` for Ask Data.

- [ ] **Step 1: Write the failing Node smoke test**

Assert 11 sorted weeks, latest label `Aug 24 – Aug 30, 2026`, latest sales `$5,987,969.17`, authorization `96.78%`, orders `529,752`, average ticket `$11.30`, exact brand reconciliation, and YTD aggregation from all loaded weeks. Assert the preview HTML exposes `data-tab="olo"` and contains all required Olo panel IDs.

- [ ] **Step 2: Verify RED**

Run `node tests/olo_pay_smoke.js`. Expected: failure because the Olo script and tab do not exist.

- [ ] **Step 3: Implement the preview panel**

Replace the locked Olo button with an active tab. Build one slide with four headline KPIs, sales/auth trends, card-brand mix, refund/void supporting values, and a detail table. Label it `OLO PAY · DIGITAL APPROVAL & SALES` and `Company owned shops only`. Do not render wallet or decline-reason placeholders as numbers.

- [ ] **Step 4: Bind periods and charts**

Use the selected week when its ID exists in Olo data and aggregate loaded weeks for YTD. Render Dutch-blue sales, red/blue authorization movement, and Dutch-token brand colors with the existing inline value-label plugin.

- [ ] **Step 5: Verify GREEN and commit**

Run `node tests/olo_pay_smoke.js`, `node tests/slide_layout_smoke.js`, and `python3 scripts/stamp_asset_versions.py`. Re-run stamp check and commit the preview dashboard.

---

### Task 3: Ask Data Olo support

**Files:**
- Create: `tests/chatbot_olo_smoke.js`
- Modify: `site/preview/js/chatbot.js`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `window.__oloPayState`.
- Produces: deterministic answers for Olo sales, authorization rate, orders, average ticket, brand mix, source, and Phase 1 limitations.

- [ ] **Step 1: Write failing chatbot smoke tests**

Assert that Olo-specific questions return the selected Olo week’s published figures, that source answers name Stripe and Olo billing transactions, that scope answers say company-owned only, and that wallet/decline-reason questions say unavailable in Phase 1 without inventing values.

- [ ] **Step 2: Verify RED**

Run `node tests/chatbot_olo_smoke.js`. Expected: Olo questions fall through or omit published figures.

- [ ] **Step 3: Implement deterministic Olo answers**

Read only normalized values from `window.__oloPayState`; add explicit Olo routing before generic Worldpay/POS aliases. Keep ambiguous sales/ticket/auth questions channel-aware.

- [ ] **Step 4: Verify GREEN and commit**

Run the new Olo chatbot test plus all existing chatbot smoke tests. Restamp preview assets and commit.

---

### Task 4: Full verification and preview publication

**Files:**
- Modify only files needed to address test or review findings.

- [ ] **Step 1: Run complete local CI**

Run `python3 -m pytest -q`, every `node tests/*_smoke.js` command listed in `.github/workflows/deploy-pages.yml`, `python3 scripts/stamp_asset_versions.py --check`, and the Worldpay certification command from the workflow.

- [ ] **Step 2: Verify preview-only boundary**

Confirm no leadership `site/index.html`, `site/js/`, `site/css/`, or `site/data/olo_pay_data.json` changes exist.

- [ ] **Step 3: Review the branch**

Review the full merge-base diff for source-derived values, CO-only enforcement, accessibility, responsive layout, stale asset stamps, and invented chatbot facts. Fix all material findings and re-run affected tests.

- [ ] **Step 4: Push and open preview PR**

Push `cursor/preview-olo-pay-8ee2`, create a draft PR to `main`, then mark it ready after CI-equivalent checks pass. The user reviews the preview URL; leadership remains unchanged until explicit promotion.
