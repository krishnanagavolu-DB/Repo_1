# Worldpay data certification

The dashboard is now **fail closed**: data must pass certification before GitHub Pages can publish it.

## What a data science / data engineer does here

A data engineer makes raw files dependable before anyone uses them for decisions. For this dashboard that means:

1. **Contract the input** — confirm the expected files, columns, weekly date, and row grain.
2. **Validate types** — counts must be whole non-negative numbers; dollars/fees must be finite numeric values.
3. **Protect against duplication** — detect repeat files and exact rows that would double-count sales or authorizations.
4. **Check completeness** — require both Auth Summary and Interchange for every week and reject missing critical fields.
5. **Reconcile systems** — compare approved authorizations with settled sales counts/dollars within a reasonable tolerance.
6. **Test business rules** — approved counts cannot exceed attempts; rates must use the locked formulas.
7. **Detect anomalies** — flag unusually large week-over-week movement for human review rather than silently publishing it.
8. **Verify outputs** — confirm processed, leadership, and preview `dashboard.json` copies are byte-for-byte identical.
9. **Preserve lineage** — keep the raw weekly files and a machine-readable certification report so results can be reproduced.

This does not “fix” suspicious data automatically. It stops or warns, so a human can reconcile the source rather than hide a real business event.

## Hard failures (publish is blocked)

- Missing/ambiguous Auth or Interchange file
- Week folder is not a Monday or is duplicated
- Missing required column / empty file
- Invalid, infinite, negative, or fractional measures
- Missing critical dimensions
- Exact duplicate rows
- Approved authorization count exceeds total attempts
- Zero sales/authorization totals
- Published JSON copies do not match
- Unit/KPI tests fail

## Warnings (review before publish)

- Gap in weekly folders
- Multiple rows at the same dimensional grain
- Unexpected transaction type
- Auth-to-sales count/dollar ratio outside 0.80–1.20
- Sales, transaction, approved-dollar, or attempt volume moves more than 40% week over week
- Auth rate moves more than 2 percentage points week over week

Warnings can represent a real holiday, promotion, outage, or report correction. The owner should document why the movement is credible before proceeding.

## Commands

Ingest (raw validation runs first):

```bash
python3 scripts/ingest_worldpay.py --raw data/raw \
  --out data/processed/dashboard.json \
  --site-copy site/data/dashboard.json \
  --site-copy site/preview/data/dashboard.json
```

Final certification:

```bash
python3 scripts/validate_worldpay.py \
  --raw data/raw \
  --dashboard data/processed/dashboard.json \
  --dashboard site/data/dashboard.json \
  --dashboard site/preview/data/dashboard.json
```

Report: `data/processed/validation_report.json`

## Current scope caveats

- Source files are aggregate, not transaction-level; retries/false declines cannot be deduplicated.
- No shop/store identifier exists, so shop-level anomaly detection is unavailable.
- Amex interchange fee is reported as $0/pass-through, so IC rate understates full acceptance cost.
- Competitor payment KPIs are not public on comparable definitions; the chatbot labels competitor facts as context, not direct benchmarks.
