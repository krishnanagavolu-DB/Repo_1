# Olo Pay weekly refresh

Company-owned Olo Pay (Stripe on Olo billing) is certified from one JSON file per completed Monday–Sunday week, then combined into the preview dashboard extract.

## Inputs

| Item | Path |
| --- | --- |
| Weekly source files | `data/raw/olo-pay/olo_pay_data_YYYYMMDD.json` (YYYYMMDD = Monday week start) |
| Methodology | `data/raw/olo-pay/olo_pay_methodology.json` |
| Combined output | `data/processed/olo_pay_data.json` |
| Preview copy | `site/preview/data/olo_pay_data.json` |
| Validation report | `data/processed/olo_pay_validation_report.json` |

Do not invent wallet mix or decline reasons in Phase 1. Sales, orders, average ticket, auth rate, brand mix, refunds, and voids come only from the weekly JSON.

## Refresh steps

1. Drop the new Monday–Sunday week file into `data/raw/olo-pay/` using the canonical name `olo_pay_data_YYYYMMDD.json`.
2. Confirm franchised and unmapped sales are exactly `0`, `filter.processor` is `Stripe`, and the shop filter cites company-owned ownership via the Gold curated store view.
3. Run the importer (writes processed, preview, and report together):

```bash
python3 scripts/import_olo_pay.py data/raw/olo-pay/olo_pay_data_*.json \
  --methodology data/raw/olo-pay/olo_pay_methodology.json \
  --out data/processed/olo_pay_data.json \
  --report data/processed/olo_pay_validation_report.json \
  --preview-copy site/preview/data/olo_pay_data.json
```

4. If validation fails, fix the source week (or methodology) and rerun. The CLI does not write `--out` / `--preview-copy` on hard errors.
5. Confirm CI parity locally with a temp regen + byte compare (same command CI uses):

```bash
tmpdir=$(mktemp -d)
python3 scripts/import_olo_pay.py data/raw/olo-pay/olo_pay_data_*.json \
  --methodology data/raw/olo-pay/olo_pay_methodology.json \
  --out "$tmpdir/olo_pay_data.json" \
  --report "$tmpdir/olo_pay_validation_report.json" \
  --preview-copy "$tmpdir/preview_olo_pay_data.json"
if ! cmp "$tmpdir/olo_pay_data.json" data/processed/olo_pay_data.json; then
  echo "Processed JSON drifted from raw regen. Re-run import_olo_pay.py and commit data/processed/olo_pay_data.json." >&2
  exit 1
fi
if ! cmp "$tmpdir/preview_olo_pay_data.json" site/preview/data/olo_pay_data.json; then
  echo "Preview JSON drifted from raw regen. Re-run import_olo_pay.py and commit site/preview/data/olo_pay_data.json." >&2
  exit 1
fi
```

6. Commit the new raw week plus updated processed/preview/report files. Preview UI assets do not need a restamp unless `site/preview/js|css` changed.

## Guardrails

- Weekly files must stay contiguous Mondays with no duplicates.
- Definitions, filter, brand order, and environment/scope must match across weeks — the combiner rejects silent drift.
- Published `week_over_week` sales, transaction, and auth-point deltas are checked against adjacent weeks.
- Leadership `site/` (non-preview) is untouched until an explicit promote.
