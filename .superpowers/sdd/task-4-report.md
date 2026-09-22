# Task 4 report

Status: complete

Implementation SHA: `bd4a1c6`

## RED evidence

- `node tests/chatbot_channel_smoke.js` failed for missing In-Shop Sales and Card Health definitions, missing POS/Worldpay non-additivity guidance, legacy YTD wording, and absent Executive Overview prompts/blurb.
- `node tests/chatbot_olo_smoke.js` failed for the missing Order Ahead definition and inaccurate tip treatment.
- `node tests/format_smoke.js` failed for all three old slide labels, old empty-state labels, and default overview Ask Data copy falling back to generic/Worldpay prompts.
- `node tests/slide_layout_smoke.js` remained green, confirming the existing slide baseline.

## GREEN evidence

- Focused channel, Olo, format, slide-layout, and Executive Overview smoke tests passed.
- Full publish CI passed: 97 Python tests; all 14 Node smoke suites; asset-stamp check; Olo raw-to-published byte parity; and Worldpay validation.
- Olo certification reported 14 weeks, 0 errors, and 0 warnings.

## Self-review

- Exact executive labels are visible while POS/Gold, Worldpay, and Olo Pay/Stripe source names remain in definitions and technical copy.
- Executive Overview now has its own initial/runtime Ask Data blurb and prompts.
- POS/Worldpay overlap is explicit and the assistant says not to add the feeds; Olo Pay is identified as separate order-ahead traffic.
- Olo answers now match published `sales_excludes_tip: true` and `TIP_PORTION` methodology.
- Legacy `YTD` queries and period IDs remain accepted while visible aggregate language says “Available history.”
- Changes are limited to preview product code, preview tests, and this report; no leadership files were edited.

## Concerns

- Full Worldpay validation still emits its existing data-quality warnings (unlabeled declines, weekly outliers, multiweek sales movement, and the Amex fee blind spot) plus `openpyxl` workbook-style warnings. Validation exits successfully with 0 errors; this task does not alter data or claim causes/targets.
- No push was performed, as requested.
