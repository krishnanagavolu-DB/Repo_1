#!/usr/bin/env bash
# Run the same checks the Pages deploy runs, the same way it runs them.
#
# Use this before pushing. `python3 -m pytest` is deliberately avoided: it puts
# the repo root on sys.path, so import mistakes pass locally and then fail
# collection in CI, which blocks every publish including weekly data.
#
# Usage: scripts/run_ci_checks.sh

set -euo pipefail

cd "$(dirname "$0")/.."

# pip installs console scripts here; CI has them on PATH already.
if ! command -v pytest >/dev/null 2>&1 && [ -x "$HOME/.local/bin/pytest" ]; then
  PATH="$HOME/.local/bin:$PATH"
  export PATH
fi

if ! command -v pytest >/dev/null 2>&1; then
  echo "pytest is not on PATH. Install it with: pip install -r requirements.txt" >&2
  echo "Do not substitute 'python3 -m pytest' — it hides sys.path errors CI will catch." >&2
  exit 1
fi

pytest -q
node tests/chatbot_smoke.js
node tests/chatbot_xenial_smoke.js
node tests/chatbot_exclusions_smoke.js
node tests/chatbot_mix_trend_smoke.js
node tests/chatbot_channel_smoke.js
node tests/chatbot_olo_smoke.js
node tests/format_smoke.js
node tests/slide_layout_smoke.js
node tests/pos_sales_smoke.js
node tests/olo_pay_smoke.js
node tests/notices_smoke.js
node tests/ytd_banner_smoke.js
python3 scripts/stamp_asset_versions.py --check

# Olo Pay raw→published byte parity (temp regen; does not alter importer CLI)
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
python3 scripts/import_olo_pay.py data/raw/olo-pay/olo_pay_data_*.json \
  --methodology data/raw/olo-pay/olo_pay_methodology.json \
  --out "$tmpdir/olo_pay_data.json" \
  --report "$tmpdir/olo_pay_validation_report.json" \
  --preview-copy "$tmpdir/preview_olo_pay_data.json"
if ! cmp "$tmpdir/olo_pay_data.json" data/processed/olo_pay_data.json; then
  echo "Olo Pay processed JSON drifted from raw regen. Re-run scripts/import_olo_pay.py and commit data/processed/olo_pay_data.json." >&2
  exit 1
fi
if ! cmp "$tmpdir/preview_olo_pay_data.json" site/preview/data/olo_pay_data.json; then
  echo "Olo Pay preview JSON drifted from raw regen. Re-run scripts/import_olo_pay.py and commit site/preview/data/olo_pay_data.json." >&2
  exit 1
fi

python3 scripts/validate_worldpay.py \
  --raw data/raw \
  --dashboard data/processed/dashboard.json \
  --dashboard site/data/dashboard.json \
  --dashboard site/preview/data/dashboard.json

echo
echo "All CI checks passed locally."
