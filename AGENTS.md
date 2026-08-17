# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **Python data pipeline + static JavaScript site** (no build step, no `package.json`). Two products live here:

- **Worldpay Executive KPI Dashboard** — Python ingest (`scripts/ingest_worldpay.py`, `src/worldpay_dashboard/`) turns Worldpay Excel reports in `data/raw/` into `data/processed/dashboard.json` and copies to `site/data/dashboard.json`. The dashboard itself is the static site in `site/` (also a `site/preview/` variant).
- **NSO First Tamper Check reminders** — CLI decision engine (`scripts/run_nso_reminders.py`, `src/nso_reminders/`).

Standard commands live in `README.md`, `.github/workflows/deploy-pages.yml` (the certification pipeline), and the runbooks under `docs/ops/`. Prefer those over duplicating here.

### Non-obvious notes

- **`pytest` is not on `PATH`.** `pip install --user` puts it in `~/.local/bin`, which isn't on `PATH`. Run tests with `python3 -m pytest -q` (config in `pytest.ini` sets `pythonpath=src`).
- **CI runs three test layers**, all reproduced locally without extra deps (Node is preinstalled, smoke tests use only Node core modules): `python3 -m pytest -q`, `node tests/chatbot_smoke.js`, `node tests/format_smoke.js`. The `deploy-pages.yml` workflow gates publish on these plus `scripts/validate_worldpay.py`.
- **No linter is configured** (no ruff/flake8/eslint). The Node smoke tests double as the JS correctness/format gate.
- **`openpyxl` prints `Workbook contains no default style` warnings** when reading the Worldpay Excels — harmless, ignore.
- **Ingest is deterministic** except the `generated_at` timestamp; re-running `ingest_worldpay.py` reproduces `data/processed/dashboard.json` byte-for-byte apart from that field. When testing, write to a temp path (e.g. `--out /tmp/x.json`) to avoid dirtying committed data.
- **Serving the site:** `cd site && python3 -m http.server 8080`, then open `http://localhost:8080`. The `site/` directory must be the server root (JS fetches `data/*.json` and `auth-config.json` with relative paths).
- **Password gate:** `/` and `/preview/` show a SHA-256 password lock (`site/auth-config.json`) before KPIs render; plaintext is not stored in the repo. The gate unlocks when `sessionStorage[sessionKey]` equals the stored `passwordHash`. To view the dashboard in an automated/headless browser without the plaintext, set that sessionStorage key to the hash (this is exactly what the app does after a correct entry). See `docs/ops/password-gate.md`.
- **Chatbot / dashboard JS internals** are exposed on `window` for tests/automation: `window.__paymentsChat.answerQuestion(q)`, `window.__dashboardFormat`, `window.__dashboardState`, `window.__benchmarkData`.
- **Weekly data refresh** pulls Excels from a Worldpay SharePoint drop zone (see `.cursor/rules/sharepoint-dropzone.mdc`, `config/sharepoint-source.json`, `docs/ops/monday-automation.md`). SharePoint auth is not available in this environment; ingest/validate against the checked-in fixtures in `data/raw/` instead.
