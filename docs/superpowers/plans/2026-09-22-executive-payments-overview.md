# Executive Payments Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a screenshot-ready Executive Overview as the default `/preview/` tab while preserving detailed channel slides and preventing unavailable-period empty states.

**Architecture:** Add a focused `executive-overview.js` module that reads the already-certified POS, Worldpay, and Olo data, exposes pure cross-channel calculation helpers, and renders one compact slide. Extend `tabs.js` into the single period-availability coordinator; channel modules remain responsible for their own data normalization and rendering. Only `site/preview/` changes.

**Tech Stack:** Static HTML/CSS/JavaScript, Chart.js 4.4.1, Node smoke tests, existing Python/Node publish suite.

## Global Constraints

- Modify preview files only; do not modify leadership `site/index.html`, `site/css/`, `site/js/`, or leadership assets.
- Keep the existing Dutch Bros typography, colors, panel bands, borders, and slide format.
- The 1440×900 overview must contain no more than six KPI cards, two charts, and three watchlist items.
- Do not add POS and Worldpay sales; they overlap.
- Do not invent targets, causes, store rankings, regions, prior-year comparisons, alerts, or unavailable metrics.
- Replace visible “YTD” coverage language with “Available history.”
- Period choices must be valid for the active tab.
- Follow test-driven development: add and run a failing test before each production behavior.

---

### Task 1: Pure overview calculations and data contract

**Files:**
- Create: `site/preview/js/executive-overview.js`
- Create: `tests/executive_overview_smoke.js`
- Modify: `scripts/run_ci_checks.sh`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: `window.__posSales.normalizePosData(payload)`, `window.__oloPay.normalizeOloData(payload)`, and Worldpay `payload.periods.weeks`.
- Produces: `window.__executiveOverview` with:
  - `worldpayWeeks(payload): OverviewWorldpayWeek[]`
  - `intersectPeriodIds(posWeeks, worldpayWeeks, oloWeeks): string[]`
  - `overviewForPeriod(periodId, sources): OverviewModel`
  - `buildWatchlist(model): WatchItem[]`
  - `formatSignedPct(value): string`

- [ ] **Step 1: Write the failing pure-helper smoke test**

Create `tests/executive_overview_smoke.js` with a VM sandbox that loads
`pos-sales.js`, `olo-pay.js`, and the new overview module. Load the three live
preview JSON files and assert:

```javascript
const periodIds = overview.intersectPeriodIds(posWeeks, worldpayWeeks, oloWeeks);
check("period intersection starts when all sources overlap", periodIds[0], "2026-07-20");
check("period intersection ends latest", periodIds.at(-1), "2026-09-14");
check("period intersection has no duplicates", new Set(periodIds).size, periodIds.length);

const model = overview.overviewForPeriod("2026-09-14", {
  pos: posWeeks,
  worldpay: worldpayWeeks,
  olo: oloWeeks,
});
check("POS sales stays POS only", model.kpis.inShopSales.value, 44151389.8);
check("Olo sales stays separate", model.kpis.orderAheadSales.value, 5581687.75);
check("overview has six KPI cards", Object.keys(model.kpis).length, 6);
check("sales trend excludes Worldpay dollars", model.salesTrend.datasets.length, 2);
check("watchlist maximum", model.watchlist.length <= 3, true);
check("watchlist claims no cause", /because|caused by|driven by/i.test(model.watchlist.map(x => x.text).join(" ")), false);
```

Also test null-source behavior:

```javascript
const partial = overview.overviewForPeriod("2026-09-14", {
  pos: posWeeks,
  worldpay: [],
  olo: oloWeeks,
});
check("missing Worldpay is unavailable", partial.kpis.cardAuthRate.value, null);
check("missing Worldpay creates coverage notice", partial.watchlist.some(x => /Worldpay.*not available/i.test(x.text)), true);
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node tests/executive_overview_smoke.js
```

Expected: failure because `site/preview/js/executive-overview.js` does not
exist.

- [ ] **Step 3: Implement the pure calculation module**

Create `site/preview/js/executive-overview.js` as an IIFE. Implement:

```javascript
function intersectPeriodIds(posWeeks, worldpayWeeks, oloWeeks) {
  const pos = new Set(posWeeks.map((week) => week.sortKey));
  const wp = new Set(worldpayWeeks.map((week) => week.id));
  const olo = new Set(oloWeeks.map((week) => week.sortKey));
  return [...pos].filter((id) => wp.has(id) && olo.has(id)).sort();
}
```

Normalize Worldpay into:

```javascript
{
  id,
  label,
  authRate: Number(week.kpis.auth_rate.value) * 100,
  authDeltaPp: Number(week.kpis.auth_rate.delta) * 100,
  icRate: Number(week.kpis.ic_rate.value),
  icFee: Number(week.kpis.ic_fee.value),
}
```

Build six KPI entries:

```javascript
{
  inShopSales: { label: "In-shop sales", value, display, delta, source: "POS · ex-tip" },
  inShopOrders: { label: "In-shop orders", value, display, delta, source: "POS · guest checks" },
  inShopAvgTicket: { label: "In-shop avg ticket", value, display, delta, source: "POS · ex-tip" },
  cardAuthRate: { label: "Card auth rate", value, display, delta, source: "Worldpay · card present" },
  orderAheadSales: { label: "Order-ahead sales", value, display, delta, source: "Olo Pay · ex-tip" },
  orderAheadAuthRate: { label: "Order-ahead auth rate", value, display, delta, source: "Stripe · order ahead" },
}
```

Use adjacent prior weeks from the same source for deltas. Build the sales trend
from at most the final 12 POS and Olo weeks, with two separate datasets. Build
the POS tender mix only from the selected POS week. Build at most three
watchlist observations sorted by absolute movement and add one source-coverage
notice when needed.

Export the pure helpers immediately:

```javascript
window.__executiveOverview = {
  worldpayWeeks,
  intersectPeriodIds,
  overviewForPeriod,
  buildWatchlist,
  formatSignedPct,
};
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
node tests/executive_overview_smoke.js
```

Expected: `Executive overview smoke checks passed`.

- [ ] **Step 5: Wire the new smoke test into local and GitHub CI**

Add this command after the Olo smoke command in both
`scripts/run_ci_checks.sh` and `.github/workflows/deploy-pages.yml`:

```bash
node tests/executive_overview_smoke.js
```

Run:

```bash
pytest tests/test_ci_parity.py -q
```

Expected: all CI-parity tests pass.

- [ ] **Step 6: Commit**

```bash
git add site/preview/js/executive-overview.js tests/executive_overview_smoke.js \
  scripts/run_ci_checks.sh .github/workflows/deploy-pages.yml
git commit -m "feat: add executive overview data model"
```

---

### Task 2: Tab-aware period coordination and Available History

**Files:**
- Modify: `site/preview/js/tabs.js`
- Modify: `site/preview/js/dashboard.js`
- Modify: `site/preview/js/ytd-banner.js`
- Modify: `site/preview/js/pos-sales.js`
- Modify: `site/preview/js/olo-pay.js`
- Create: `tests/tab_period_smoke.js`
- Modify: `tests/ytd_banner_smoke.js`
- Modify: `scripts/run_ci_checks.sh`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Produces: `window.__dashboardTabs.registerPeriods(tabId, periods)` where each
  period is `{ id, label }`.
- Produces: `window.__dashboardTabs.getPeriods(tabId)` and
  `window.__dashboardTabs.activate(tabId)`.
- Emits `dashboard:period` with `{ periodId, tabId }`.
- Consumes `dashboard:periods` events from channel loaders.

- [ ] **Step 1: Write failing coordinator tests**

Create `tests/tab_period_smoke.js` using a small fake DOM/select. Assert:

```javascript
tabs.registerPeriods("pos", [
  { id: "2026-08-31", label: "Aug 31 – Sep 6, 2026" },
  { id: "2026-09-07", label: "Sep 7 – Sep 13, 2026" },
]);
tabs.registerPeriods("worldpay", [
  { id: "2026-09-07", label: "Sep 7 – Sep 13, 2026" },
]);
tabs.activate("pos");
check("POS offers its weeks plus history", select.options.length, 3);
select.value = "2026-08-31";
tabs.activate("worldpay");
check("invalid date falls back to latest Worldpay", select.value, "2026-09-07");
check("history option copy", select.options.at(-1).textContent, "Available history");
```

Update `tests/ytd_banner_smoke.js` expected copy to:

```text
Available history: every certified week since Jul 27, 2026 — 3 weeks loaded.
```

Also assert `buildMessage` does not contain `YTD`.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/tab_period_smoke.js
node tests/ytd_banner_smoke.js
```

Expected: failures because `registerPeriods` does not exist and banner copy
still says YTD.

- [ ] **Step 3: Implement the period registry in `tabs.js`**

Replace the comment that the period control only drives Worldpay. Maintain:

```javascript
const periodsByTab = {};
let activeTabId = "overview";

function registerPeriods(tabId, periods) {
  periodsByTab[tabId] = periods;
  if (tabId === activeTabId) populateSelect(tabId);
}

function populateSelect(tabId) {
  const select = document.getElementById("period-select");
  const periods = periodsByTab[tabId] || [];
  const wanted = select.value;
  select.replaceChildren(
    ...periods.map(optionForPeriod),
    optionForPeriod({ id: "history", label: "Available history" })
  );
  select.value = periods.some((item) => item.id === wanted)
    ? wanted
    : periods.at(-1)?.id || "history";
  announcePeriod(select.value, tabId);
}
```

Attach the select’s `change` listener once in `initTabs`. Default activation is
`overview`.

- [ ] **Step 4: Register periods from each channel**

In each data loader, after normalization:

```javascript
window.__dashboardTabs?.registerPeriods(
  "pos",
  weeks.map((week) => ({ id: week.sortKey, label: week.label }))
);
```

Use tab IDs `worldpay`, `olo`, and `overview`. For overview, the overview module
registers only the intersection.

Change channel aggregate selectors from `"ytd"` to `"history"`. Keep accepting
`"ytd"` internally as a backward-compatible alias in pure helpers, but never
show it in the select.

- [ ] **Step 5: Change the coverage banner**

Update `ytd-banner.js`:

```javascript
return `Available history: every certified week since ${startLabel} — ${weekCount} ${weekWord} loaded.`;
```

Render only when `activePeriodId === "history"`. Rename comments and internal
function descriptions from YTD to available history; retain
`window.__ytdBanner` as the public object name to avoid unrelated churn.

- [ ] **Step 6: Verify coordinator tests GREEN**

Run:

```bash
node tests/tab_period_smoke.js
node tests/ytd_banner_smoke.js
node tests/pos_sales_smoke.js
node tests/olo_pay_smoke.js
```

Expected: all four pass.

- [ ] **Step 7: Wire the coordinator smoke test into CI and commit**

Add:

```bash
node tests/tab_period_smoke.js
```

to local and GitHub CI, then run:

```bash
pytest tests/test_ci_parity.py -q
```

Commit:

```bash
git add site/preview/js/tabs.js site/preview/js/dashboard.js \
  site/preview/js/ytd-banner.js site/preview/js/pos-sales.js \
  site/preview/js/olo-pay.js tests/tab_period_smoke.js \
  tests/ytd_banner_smoke.js scripts/run_ci_checks.sh \
  .github/workflows/deploy-pages.yml
git commit -m "feat: make dashboard periods tab-aware"
```

---

### Task 3: Screenshot-ready overview markup and rendering

**Files:**
- Modify: `site/preview/index.html`
- Modify: `site/preview/js/executive-overview.js`
- Modify: `site/preview/css/dashboard.css`
- Modify: `tests/executive_overview_smoke.js`
- Modify: `tests/slide_layout_smoke.js`

**Interfaces:**
- Consumes: `OverviewModel` from Task 1 and period events from Task 2.
- Produces: overview DOM IDs:
  - `panel-overview`
  - `overview-period-label`
  - `overview-kpis`
  - `chart-overview-sales`
  - `chart-overview-tender`
  - `legend-overview-tender`
  - `overview-watchlist`
  - `overview-reconciliation`

- [ ] **Step 1: Add failing markup and rendering assertions**

Extend `tests/executive_overview_smoke.js` to assert:

```javascript
check("overview tab is first and active", /class="tab active"[^>]*data-tab="overview"/.test(html), true);
check("overview panel exists", html.includes('data-panel="overview"'), true);
check("six-card grid exists", html.includes('id="overview-kpis"'), true);
check("sales chart exists", html.includes('id="chart-overview-sales"'), true);
check("tender chart exists", html.includes('id="chart-overview-tender"'), true);
check("watchlist exists", html.includes('id="overview-watchlist"'), true);
check("reconciliation note names overlap", /Worldpay[^<]*overlap/i.test(html), true);
check("overview script loads after POS and Olo helpers", overviewRef > posRef && overviewRef > oloRef, true);
```

Extend `tests/slide_layout_smoke.js` to assert the new channel labels:

```javascript
check("In-Shop Sales nav", html.includes(">In-Shop Sales</button>"), true);
check("Card Health nav", html.includes(">Card Health</button>"), true);
check("Order Ahead nav", html.includes(">Order Ahead</button>"), true);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/executive_overview_smoke.js
node tests/slide_layout_smoke.js
```

Expected: missing overview landmarks and old navigation copy.

- [ ] **Step 3: Add overview markup and rename navigation**

In `site/preview/index.html`, change the navigation to:

```html
<button type="button" class="tab active" data-tab="overview" aria-current="page">
  Executive Overview
</button>
<div class="tab-group" role="group" aria-label="In Shop">
  <span class="tab-group-label">In Shop</span>
  <div class="tab-group-items">
    <button type="button" class="tab" data-tab="pos">In-Shop Sales</button>
    <button type="button" class="tab" data-tab="worldpay">Card Health</button>
  </div>
</div>
<button type="button" class="tab" data-tab="olo">Order Ahead</button>
```

Insert `panel-overview` before `panel-pos`:

```html
<section id="panel-overview" class="tab-panel" data-panel="overview">
  <section class="slide executive-slide" aria-label="Payments Executive Overview">
    <header class="slide-band">
      <div>
        <h2>Payments Executive Overview</h2>
        <span>Company-owned shops · completed weeks</span>
      </div>
      <p id="overview-period-label">Most recent common week</p>
    </header>
    <div class="executive-board">
      <div class="executive-kpis" id="overview-kpis"></div>
      <article class="slide-panel executive-sales-panel">
        <div class="panel-band">Sales trend by channel</div>
        <div class="panel-body"><canvas id="chart-overview-sales"></canvas></div>
      </article>
      <article class="slide-panel executive-mix-panel">
        <div class="panel-band">How guests paid in shop</div>
        <div class="panel-body">
          <canvas id="chart-overview-tender"></canvas>
          <table id="legend-overview-tender" class="mix-legend compact-legend"></table>
        </div>
      </article>
      <article class="slide-panel executive-watch-panel">
        <div class="panel-band">Leadership watchlist</div>
        <ol id="overview-watchlist" class="executive-watchlist"></ol>
      </article>
    </div>
    <p id="overview-reconciliation" class="executive-reconciliation">
      POS sales are ex-tip. Worldpay card dollars include tip and overlap POS card sales.
      Olo Pay is order-ahead and is not added to Worldpay.
    </p>
  </section>
</section>
```

Load `js/executive-overview.js` after `olo-pay.js` and before `tabs.js`.

- [ ] **Step 4: Implement overview loading and rendering**

In `executive-overview.js`, add `loadOverview()` that fetches the same three
preview JSON files with `cache: "no-store"`, normalizes them, stores
`window.__executiveOverviewState`, registers intersected periods, and renders
the latest common period.

Render KPI cards with:

```html
<article class="executive-kpi">
  <span class="executive-kpi-source">POS · ex-tip</span>
  <strong>$44.2M</strong>
  <span>In-shop sales</span>
  <small class="down">−4.7% vs prior week</small>
</article>
```

Render one Chart.js line chart with POS and Olo datasets and one doughnut chart
with POS tender rows. Render the watchlist as three `<li>` elements with
`data-tone="watch|context|positive"`.

Listen for `dashboard:period` only when `event.detail.tabId === "overview"`.
Start loading after `dashboard:unlocked` like the existing channel modules.

- [ ] **Step 5: Add screenshot-focused CSS**

Add component styles under an `/* Executive overview */` section:

```css
.executive-slide { max-width: 1500px; margin-inline: auto; }
.executive-board {
  display: grid;
  grid-template-columns: 1.45fr 0.85fr;
  grid-template-rows: auto minmax(250px, 1fr) auto;
  gap: 12px;
  padding: 12px;
  background: var(--bg);
}
.executive-kpis {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
}
.executive-watch-panel { grid-column: 1 / -1; min-height: 118px; }
.executive-reconciliation { margin: 0; padding: 9px 16px; font-size: 11px; color: var(--muted); }
```

Keep the overview under 710px tall excluding the top navigation and preview
banner. At `max-width: 900px`, collapse KPI cards to two columns and panels to
one column.

- [ ] **Step 6: Verify overview rendering tests GREEN**

Run:

```bash
node tests/executive_overview_smoke.js
node tests/slide_layout_smoke.js
```

Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add site/preview/index.html site/preview/js/executive-overview.js \
  site/preview/css/dashboard.css tests/executive_overview_smoke.js \
  tests/slide_layout_smoke.js
git commit -m "feat: build screenshot-ready executive overview"
```

---

### Task 4: Channel copy, methodology language, and Ask Data

**Files:**
- Modify: `site/preview/index.html`
- Modify: `site/preview/js/chatbot.js`
- Modify: `tests/chatbot_channel_smoke.js`
- Modify: `tests/chatbot_olo_smoke.js`
- Modify: `tests/format_smoke.js`

**Interfaces:**
- Keeps technical source names: POS/Gold, Worldpay, Olo Pay/Stripe.
- Exposes executive labels: In-Shop Sales, Card Health, Order Ahead.

- [ ] **Step 1: Write failing visible-copy tests**

Add assertions:

```javascript
check("POS slide label", html.includes("In-Shop Sales · Tender mix"), true);
check("Worldpay slide label", html.includes("Card Health · Approval &amp; cost"), true);
check("Olo slide label", html.includes("Order Ahead · Olo Pay &amp; Stripe"), true);
check("no visible YTD acronym", />[^<]*\\bYTD\\b[^<]*</.test(html), false);
```

Add chatbot channel assertions:

```javascript
checkAnswer("What is In-Shop Sales?", /POS.*Card.*Cash.*Gift Card/i);
checkAnswer("What is Card Health?", /Worldpay.*authoriz.*decline.*interchange/i);
checkAnswer("What is Order Ahead?", /Olo Pay.*Stripe/i);
checkAnswer("Can I add POS and Worldpay sales?", /overlap.*do not add/i);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
node tests/slide_layout_smoke.js
node tests/chatbot_channel_smoke.js
node tests/chatbot_olo_smoke.js
```

Expected: old labels or missing executive definitions.

- [ ] **Step 3: Update visible channel copy**

Use these exact labels:

- `In-Shop Sales · Tender mix`
- `Card Health · Approval & cost`
- `Order Ahead · Olo Pay & Stripe`
- `Available history` everywhere the aggregate period appears

Keep the current source/grain explanations. Update empty states from “All
payments” to “In-Shop Sales” and from “Olo Pay” to “Order Ahead (Olo Pay).”

- [ ] **Step 4: Add grounded Ask Data definitions**

Add canonical definitions:

```javascript
{
  title: "In-Shop Sales",
  body: "Company-owned POS sales from Gold Semantic Sales: Card, Cash, and Gift Card / Dutch Pass. Sales and average ticket exclude tips and change."
}
{
  title: "Card Health",
  body: "Worldpay card-present processing health: authorization rate, declines, entry method, wallets, interchange rate, and fees. These card dollars include tip and overlap POS card sales."
}
{
  title: "Order Ahead",
  body: "Olo Pay order-ahead transactions processed by Stripe at company-owned shops. Published sales and average ticket exclude tip."
}
```

Add a direct non-additivity response:

> Do not add POS and Worldpay sales. Worldpay is the processor view of the card
> portion of POS sales and includes tip. Olo Pay is a separate order-ahead
> channel.

- [ ] **Step 5: Run channel tests GREEN and commit**

Run:

```bash
node tests/slide_layout_smoke.js
node tests/chatbot_channel_smoke.js
node tests/chatbot_olo_smoke.js
node tests/format_smoke.js
```

Expected: all pass.

Commit:

```bash
git add site/preview/index.html site/preview/js/chatbot.js \
  tests/chatbot_channel_smoke.js tests/chatbot_olo_smoke.js \
  tests/format_smoke.js
git commit -m "feat: clarify executive channel language"
```

---

### Task 5: Asset stamps, full verification, and visual proof

**Files:**
- Modify (generated): `site/preview/index.html`
- Test: all `tests/`

**Interfaces:**
- Uses: `scripts/stamp_asset_versions.py`
- Produces: current preview asset query strings and a verified GitLab Pages
  preview.

- [ ] **Step 1: Update preview asset versions**

Run:

```bash
python3 scripts/stamp_asset_versions.py
```

Expected: only changed preview asset references receive new hashes; leadership
references remain unchanged unless they point to byte-identical shared assets
that were not edited.

- [ ] **Step 2: Prove leadership files were not changed**

Run:

```bash
git diff --name-only "$(git merge-base HEAD cursor/preview-wallet-other-8ee2)" -- site \
  | grep -v '^site/preview/'
```

Expected: no output.

- [ ] **Step 3: Run the full publish suite**

Run:

```bash
scripts/run_ci_checks.sh
```

Expected:

```text
All CI checks passed locally.
```

- [ ] **Step 4: Run an HTTP preview**

Start `python3 -m http.server 8080 -d site` in a tmux-backed session. Verify:

```bash
curl -I http://localhost:8080/preview/
curl -I http://localhost:8080/preview/data/dashboard.json
curl -I http://localhost:8080/preview/data/in_shop_sales_data.json
curl -I http://localhost:8080/preview/data/olo_pay_data.json
```

Expected: HTTP 200 for all four.

- [ ] **Step 5: Capture visual proof**

Use the walkthrough-artifacts skill to capture the unlocked overview at
1440×900. Verify from the artifact:

- Overview is the initial tab.
- Six KPIs are visible without scrolling.
- Both charts and all three watchlist items fit in the slide.
- Ask Data starts below the screenshot boundary.
- No text clips or overlaps.

If the artifact fails any item, adjust only preview CSS/markup, rerun relevant
smoke tests, restamp assets, and recapture.

- [ ] **Step 6: Commit verification changes**

```bash
git add site/preview/index.html
git commit -m "chore: stamp executive preview assets"
```

- [ ] **Step 7: Push and publish preview**

```bash
git push -u origin cursor/preview-executive-overview-8ee2
git push -u gitlab cursor/preview-executive-overview-8ee2
git push gitlab HEAD:main
```

Update the existing draft PR. Wait for the GitLab `main` Pages pipeline to
pass, then verify:

```text
https://db-payments-space-8aef34.gitlab.io/preview/
```

Do not promote to leadership.
