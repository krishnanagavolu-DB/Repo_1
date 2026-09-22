const fs = require("fs");
const vm = require("vm");

const sandbox = {
  console,
  Intl,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  Date,
  window: { addEventListener() {}, dispatchEvent() {} },
  document: {
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
  },
};

vm.createContext(sandbox);
for (const script of [
  "site/preview/js/pos-sales.js",
  "site/preview/js/olo-pay.js",
  "site/preview/js/executive-overview.js",
]) {
  vm.runInContext(fs.readFileSync(script, "utf8"), sandbox);
}

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const posPayload = JSON.parse(
  fs.readFileSync("site/preview/data/in_shop_sales_data.json", "utf8")
);
const worldpayPayload = JSON.parse(
  fs.readFileSync("site/preview/data/dashboard.json", "utf8")
);
const oloPayload = JSON.parse(
  fs.readFileSync("site/preview/data/olo_pay_data.json", "utf8")
);

const posWeeks = sandbox.window.__posSales.normalizePosData(posPayload);
const oloWeeks = sandbox.window.__oloPay.normalizeOloData(oloPayload);
const overview = sandbox.window.__executiveOverview;
const worldpayWeeks = overview.worldpayWeeks(worldpayPayload);

const periodIds = overview.intersectPeriodIds(posWeeks, worldpayWeeks, oloWeeks);
check("period intersection starts when all sources overlap", periodIds[0], "2026-07-20");
const latestPeriodId = periodIds.at(-1);
const latestPosWeek = posWeeks.find((week) => week.sortKey === latestPeriodId);
const latestWorldpayWeek = worldpayWeeks.find((week) => week.id === latestPeriodId);
const latestOloWeek = oloWeeks.find((week) => week.sortKey === latestPeriodId);
check(
  "latest common period is present in every normalized source",
  Boolean(latestPosWeek && latestWorldpayWeek && latestOloWeek),
  true
);
check("period intersection has no duplicates", new Set(periodIds).size, periodIds.length);
check(
  "one usable source contributes all of its periods",
  JSON.stringify(
    typeof overview.periodIdsForAvailableSources === "function"
      ? overview.periodIdsForAvailableSources({ pos: posWeeks, worldpay: [], olo: [] })
      : null
  ),
  JSON.stringify(posWeeks.map((week) => week.sortKey))
);

const model = overview.overviewForPeriod(latestPeriodId, {
  pos: posWeeks,
  worldpay: worldpayWeeks,
  olo: oloWeeks,
});
check(
  "POS sales stays equal to the normalized POS source only",
  model.kpis.inShopSales.value,
  latestPosWeek.reportedTotal ?? latestPosWeek.tenderTotal
);
check(
  "Olo sales stays equal to the normalized Olo source only",
  model.kpis.orderAheadSales.value,
  latestOloWeek.sales
);
check(
  "POS and Olo remain concretely separate source values",
  model.kpis.inShopSales.value !== model.kpis.orderAheadSales.value,
  true
);
check("overview has six KPI cards", Object.keys(model.kpis).length, 6);
check("sales trend excludes Worldpay dollars", model.salesTrend.datasets.length, 2);
check("watchlist maximum", model.watchlist.length <= 3, true);
check(
  "watchlist claims no cause or target",
  /because|caused by|driven by|target|goal|threshold/i.test(
    model.watchlist.map((x) => x.text).join(" ")
  ),
  false
);

const partial = overview.overviewForPeriod(latestPeriodId, {
  pos: posWeeks,
  worldpay: [],
  olo: oloWeeks,
});
check("missing Worldpay is unavailable", partial.kpis.cardAuthRate.value, null);
check("missing Worldpay renders explicit unavailable copy", partial.kpis.cardAuthRate.display, "Not available");
check(
  "missing Worldpay creates coverage notice",
  partial.watchlist.some((x) => /Worldpay.*not available/i.test(x.text)),
  true
);

const watchlistModel = {
  coverage: { pos: true, worldpay: true, olo: true },
  kpis: {
    inShopSales: {
      label: "In-shop sales",
      delta: { value: -4.7, unit: "percent", text: "-4.7% vs prior week" },
    },
    inShopOrders: {
      label: "In-shop orders",
      delta: { value: 2.2, unit: "percent", text: "+2.2% vs prior week" },
    },
    cardAuthRate: {
      label: "Card auth rate",
      delta: { value: -0.35, unit: "points", text: "-0.35 pts vs prior week" },
    },
    orderAheadSales: {
      label: "Order-ahead sales",
      delta: { value: 1.4, unit: "percent", text: "+1.4% vs prior week" },
    },
    orderAheadAuthRate: {
      label: "Order-ahead auth rate",
      delta: { value: -12, unit: "points", text: "-12.00 pts vs prior week" },
    },
  },
};
const designedWatchlist = overview.buildWatchlist(watchlistModel);
check("watchlist slot 1 is largest comparable movement", designedWatchlist[0]?.text, "In-shop sales -4.7% vs prior week.");
check("watchlist slot 2 always carries Card auth health", designedWatchlist[1]?.text, "Card auth rate -0.35 pts vs prior week.");
check("watchlist slot 3 is the next distinct comparable movement", designedWatchlist[2]?.text, "In-shop orders +2.2% vs prior week.");

const coverageWatchlist = overview.buildWatchlist({
  ...watchlistModel,
  coverage: { pos: true, worldpay: false, olo: true },
});
check("coverage watchlist stays capped at three", coverageWatchlist.length, 3);
check(
  "source coverage takes slot 3 without displacing Card auth slot",
  /Worldpay.*not available/i.test(coverageWatchlist[2]?.text || ""),
  true
);

const gappedWeeks = [
  {
    sortKey: "2099-01-01",
    label: "Jan 1 – Jan 7, 2099",
    reportedTotal: 100,
    orderCount: 10,
    avgTicket: 10,
    tenders: [{ label: "Card", amount: 100, pct: 1 }],
  },
  {
    sortKey: "2099-01-15",
    label: "Jan 15 – Jan 21, 2099",
    reportedTotal: 120,
    orderCount: 12,
    avgTicket: 10,
    tenders: [{ label: "Card", amount: 120, pct: 1 }],
  },
];
const gappedModel = overview.overviewForPeriod("2099-01-15", {
  pos: gappedWeeks,
  worldpay: [],
  olo: [],
});
check("a fourteen-day source gap has no prior-week comparison", gappedModel.kpis.inShopSales.delta, null);

const adjacentModel = overview.overviewForPeriod("2099-01-08", {
  pos: [
    gappedWeeks[0],
    { ...gappedWeeks[1], sortKey: "2099-01-08", label: "Jan 8 – Jan 14, 2099" },
  ],
  worldpay: [],
  olo: [],
});
check("a seven-day adjacent source week has a prior-week comparison", Boolean(adjacentModel.kpis.inShopSales.delta), true);

const html = fs.readFileSync("site/preview/index.html", "utf8");
check(
  "overview tab is first and active",
  /class="tab active"[^>]*data-tab="overview"/.test(html),
  true
);
check("overview panel exists", html.includes('data-panel="overview"'), true);
check("six-card grid exists", html.includes('id="overview-kpis"'), true);
check("sales chart exists", html.includes('id="chart-overview-sales"'), true);
check("tender chart exists", html.includes('id="chart-overview-tender"'), true);
check("watchlist exists", html.includes('id="overview-watchlist"'), true);
check("overview has a structured empty-state container", html.includes('id="overview-empty"'), true);
check("overview has a hideable content container", html.includes('id="overview-content"'), true);
check("reconciliation note names overlap", /Worldpay[^<]*overlap/i.test(html), true);
check(
  "overview sales canvas has a grounded image label",
  /<canvas id="chart-overview-sales" role="img" aria-label="[^"]*In-Shop Sales[^"]*Order Ahead[^"]*"><\/canvas>/.test(html),
  true
);
check(
  "overview tender canvas has a grounded image label",
  /<canvas id="chart-overview-tender" role="img" aria-label="[^"]*Card[^"]*Cash[^"]*Gift Card[^"]*"><\/canvas>/.test(html),
  true
);
check(
  "KPI and watchlist updates are announced politely",
  /id="overview-kpis"[^>]*aria-live="polite"/.test(html) &&
    /id="overview-watchlist"[^>]*aria-live="polite"/.test(html),
  true
);

const overviewRef = html.indexOf('src="js/executive-overview.js');
const posRef = html.indexOf('src="js/pos-sales.js');
const oloRef = html.indexOf('src="js/olo-pay.js');
check(
  "overview script loads after POS and Olo helpers",
  overviewRef > posRef && overviewRef > oloRef,
  true
);

// --- Review fix: signed percentage must use the ASCII hyphen, matching
// pos-sales.js/olo-pay.js wowLabel(), not the Unicode minus sign. ---
check("negative percent uses ASCII hyphen", overview.formatSignedPct(-4.7), "-4.7%");
check(
  "negative percent contains no Unicode minus sign",
  overview.formatSignedPct(-4.7).includes("\u2212"),
  false
);

// --- Review fix: tender doughnut canvas must be wrapped in a fixed-size
// chart-wrap container (house pattern), with no forced !important sizing
// directly on the canvas (that fights Chart.js's own responsive resize and
// distorts the circle). ---
check(
  "tender chart canvas is wrapped in a fixed-size chart-wrap container",
  /<div class="chart-wrap"><canvas id="chart-overview-tender"[^>]*><\/canvas><\/div>/.test(html),
  true
);

const css = fs.readFileSync("site/preview/css/dashboard.css", "utf8");
const askDataRef = html.indexOf('<section class="ask-data"');
const lastTabPanelRef = html.lastIndexOf('class="tab-panel"');
check(
  "shared Ask Data is structurally placed after every tab panel",
  askDataRef > lastTabPanelRef && lastTabPanelRef >= 0,
  true
);
check(
  "KPI source labels use at least 10px muted text",
  /\.executive-kpi-source\s*\{[^}]*font-size:\s*10px[^}]*color:\s*var\(--muted\)/s.test(css),
  true
);
check(
  "KPI source labels reserve two-line alignment space",
  /\.executive-kpi-source\s*\{[^}]*min-height:\s*2\.[0-9]+em/s.test(css),
  true
);
check(
  "negative watch movement uses Dutch yellow",
  /\.executive-watchlist li\[data-tone="watch"\]\s*\{[^}]*border-left-color:\s*var\(--yellow\)/s.test(css),
  true
);
check(
  "context notices use Dutch blue",
  /\.executive-watchlist li\[data-tone="context"\]\s*\{[^}]*border-left-color:\s*var\(--blue\)/s.test(css),
  true
);
check("tender canvas has no forced !important width", css.includes("width: 130px !important"), false);
check("tender canvas has no forced !important height", css.includes("height: 130px !important"), false);
check(
  "mix panel chart-wrap carries the fixed square size instead",
  /\.executive-mix-panel\s+\.chart-wrap\s*\{[^}]*width:\s*130px/.test(css),
  true
);
// A fixed width/height alone is not enough: the shared `.panel-body
// .chart-wrap { flex: 1 }` rule (used elsewhere for a chart that fills a
// column-flow panel) has equal specificity and wins the cross-axis size via
// flex-basis unless explicitly neutralized here, silently ignoring the
// width/height above. `flex-direction: row` on the panel body is what makes
// height (not width) the cross axis in the first place.
check(
  "mix panel chart-wrap neutralizes the inherited flex:1 (flex-basis wins height otherwise)",
  /\.executive-mix-panel\s+\.chart-wrap\s*\{[^}]*flex:\s*none/.test(css),
  true
);
check(
  "mix panel body is an explicit flex row so height is the cross axis",
  /\.executive-mix-panel\s+\.panel-body\s*\{[^}]*flex-direction:\s*row/.test(css),
  true
);
check(
  "bare Gift Card legend ink falls back to navy",
  typeof overview.tenderInk === "function" ? overview.tenderInk("Gift Card") : null,
  "#154167"
);

// --- Review fix: Executive Overview must support a cross-channel
// "Available history" aggregate — not a silent latest-week fallback.
// Expected sums/rates are derived from the same normalized common weeks
// used by the module under test (via each channel's own already-tested
// aggregateWeeks() helper), not hardcoded literals, so this test does not
// drift when the underlying fixture data changes. ---
const posCommonWeeks = posWeeks.filter((week) => periodIds.includes(week.sortKey));
const oloCommonWeeks = oloWeeks.filter((week) => periodIds.includes(week.sortKey));
const worldpayCommonWeeks = worldpayWeeks.filter((week) => periodIds.includes(week.id));
const expectedPosAgg = sandbox.window.__posSales.aggregateWeeks(posCommonWeeks);
const expectedOloAgg = sandbox.window.__oloPay.aggregateWeeks(oloCommonWeeks);
const expectedApprovedSum = worldpayCommonWeeks.reduce(
  (sum, week) => sum + (week.authApprovedCnt || 0),
  0
);
const expectedAttemptsSum = worldpayCommonWeeks.reduce(
  (sum, week) => sum + (week.authAttemptsCnt || 0),
  0
);
const expectedWeightedAuthRate = (expectedApprovedSum / expectedAttemptsSum) * 100;

const historyModel = overview.overviewForHistory(periodIds, {
  pos: posWeeks,
  worldpay: worldpayWeeks,
  olo: oloWeeks,
});
check("history model labels itself Available history", historyModel.label, "Available history");
check(
  "history In-shop sales matches POS aggregateWeeks over the common weeks",
  historyModel.kpis.inShopSales.value,
  expectedPosAgg.reportedTotal ?? expectedPosAgg.tenderTotal
);
check(
  "history Order-ahead sales matches Olo aggregateWeeks over the common weeks",
  historyModel.kpis.orderAheadSales.value,
  expectedOloAgg.sales
);
check(
  "history Card auth rate matches sum(approved)/sum(attempts) over the common weeks",
  historyModel.kpis.cardAuthRate.value,
  expectedWeightedAuthRate
);
check(
  "history In-shop sales is not the latest-week fallback value",
  historyModel.kpis.inShopSales.value !== model.kpis.inShopSales.value,
  true
);
check(
  "history Order-ahead sales is not the latest-week fallback value",
  historyModel.kpis.orderAheadSales.value !== model.kpis.orderAheadSales.value,
  true
);
check(
  "history does not sum POS and Olo sales together",
  historyModel.kpis.inShopSales.value + historyModel.kpis.orderAheadSales.value !==
    historyModel.kpis.inShopSales.value,
  true
);
check("history In-shop sales keeps the POS-only source label", historyModel.kpis.inShopSales.source, "POS · ex-tip");
check(
  "history Order-ahead sales keeps the Olo-only source label",
  historyModel.kpis.orderAheadSales.source,
  "Olo Pay · ex-tip"
);

// --- Review fix: card auth rate must be volume-weighted (sum(approved) /
// sum(attempts)), not a simple mean of weekly rates. A synthetic two-week
// case with deliberately lopsided volumes proves this: a simple mean of the
// two rates would land near the middle, but the true weighted rate is
// dominated by the high-volume week. ---
const lopsidedWeeks = [
  { id: "2099-01-01", authRate: 90, authApprovedCnt: 90, authAttemptsCnt: 100 },
  { id: "2099-01-08", authRate: 1, authApprovedCnt: 10, authAttemptsCnt: 1000 },
];
const naiveMean = (lopsidedWeeks[0].authRate + lopsidedWeeks[1].authRate) / 2;
const trueWeighted =
  ((lopsidedWeeks[0].authApprovedCnt + lopsidedWeeks[1].authApprovedCnt) /
    (lopsidedWeeks[0].authAttemptsCnt + lopsidedWeeks[1].authAttemptsCnt)) *
  100;
const lopsidedHistoryModel = overview.overviewForHistory(["2099-01-01", "2099-01-08"], {
  pos: [],
  worldpay: lopsidedWeeks,
  olo: [],
});
check(
  "weighted auth rate differs meaningfully from the naive mean (volume actually matters)",
  Math.abs(naiveMean - trueWeighted) > 5,
  true
);
check(
  "history card auth rate uses the volume-weighted formula, not a simple mean",
  Math.round(lopsidedHistoryModel.kpis.cardAuthRate.value * 1e6) / 1e6,
  Math.round(trueWeighted * 1e6) / 1e6
);
check(
  "history card auth rate is not the naive mean of weekly rates",
  Math.abs(lopsidedHistoryModel.kpis.cardAuthRate.value - naiveMean) > 5,
  true
);

// --- Review fix: an empty history watchlist (no coverage gaps, no
// meaningful per-week delta) must show one neutral factual coverage
// statement, not stay blank and not claim any trend or cause. ---
check("history watchlist is never empty", historyModel.watchlist.length > 0, true);
check(
  "history watchlist states coverage as a neutral fact, not a trend/cause",
  /because|caused by|driven by|trend|declin|increas|grew|grow/i.test(
    historyModel.watchlist.map((item) => item.text).join(" ")
  ),
  false
);
check(
  "history watchlist coverage fact names the common-week count and date range",
  new RegExp(`${periodIds.length}\\s+common certified weeks`).test(
    historyModel.watchlist.map((item) => item.text).join(" ")
  ),
  true
);

// Loading regressions run even when a pure-model assertion above fails so
// RED output proves HTTP failures and activation sequences are exercised.
runRenderingRegressionChecks()
  .then((renderingFailures) => {
    const allFailures = [...failures, ...renderingFailures];
    if (allFailures.length) {
      console.error(JSON.stringify(allFailures, null, 2));
      process.exit(1);
    }
    console.log("Executive overview smoke checks passed");
    console.log("Executive overview rendering smoke checks passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function makeElementStub() {
  const stub = { textContent: "", hidden: false };
  let html = "";
  Object.defineProperty(stub, "innerHTML", {
    get() {
      return html;
    },
    set(value) {
      html = value;
    },
  });
  return stub;
}

function makeClassList(active = false) {
  const values = new Set(active ? ["active"] : []);
  return {
    contains(value) {
      return values.has(value);
    },
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
  };
}

function payloadForUrl(url) {
  if (url.includes("in_shop_sales_data")) return posPayload;
  if (url.includes("dashboard.json")) return worldpayPayload;
  return oloPayload;
}

function successfulFetch(url) {
  return Promise.resolve({ ok: true, status: 200, json: async () => payloadForUrl(url) });
}

function buildRenderingHarness(fetchImpl = successfulFetch) {
  const stats = { salesCharts: 0, tenderCharts: 0 };
  const noticeCalls = [];

  class FakeChart {
    constructor(_canvas, config) {
      if (config?.type === "line") stats.salesCharts += 1;
      if (config?.type === "doughnut") stats.tenderCharts += 1;
    }
    destroy() {}
  }

  const elements = {
    "overview-kpis": makeElementStub(),
    "overview-watchlist": makeElementStub(),
    "legend-overview-tender": makeElementStub(),
    "overview-period-label": makeElementStub(),
    "chart-overview-sales": {},
    "chart-overview-tender": {},
    "overview-empty": { ...makeElementStub(), hidden: true },
    "overview-content": { ...makeElementStub(), hidden: false },
  };

  const periodSelect = {
    value: "",
    options: [],
    addEventListener() {},
    replaceChildren(...opts) {
      this.options = opts;
    },
  };

  const tabs = [
    {
      dataset: { tab: "overview" },
      classList: makeClassList(true),
      setAttribute() {},
      removeAttribute() {},
    },
    {
      dataset: { tab: "pos" },
      classList: makeClassList(false),
      setAttribute() {},
      removeAttribute() {},
    },
  ];
  const panels = [
    { dataset: { panel: "overview" }, hidden: false },
    { dataset: { panel: "pos" }, hidden: true },
  ];
  const eventListeners = {};

  const renderSandbox = {
    console,
    Intl,
    Math,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Date,
    Promise,
    Chart: FakeChart,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    window: {
      addEventListener(type, handler) {
        (eventListeners[type] = eventListeners[type] || []).push(handler);
      },
      dispatchEvent(event) {
        for (const handler of eventListeners[event.type] || []) handler(event);
      },
      __notices: {
        renderNotice(target, options) {
          noticeCalls.push(options);
          target.innerHTML = `<h3>${options.title}</h3><p>${options.message || ""}</p>`;
          target.hidden = false;
        },
      },
    },
    document: {
      body: { classList: { contains: () => false } },
      addEventListener() {},
      createElement() {
        return { value: "", textContent: "" };
      },
      getElementById(id) {
        if (id === "period-select") return periodSelect;
        return elements[id] || null;
      },
      querySelectorAll(selector) {
        return selector.includes("tab-panel") ? panels : tabs;
      },
      querySelector(selector) {
        return selector.includes(".active") ? tabs[0] : null;
      },
    },
    fetch: fetchImpl,
  };

  vm.createContext(renderSandbox);
  for (const script of [
    "site/preview/js/pos-sales.js",
    "site/preview/js/olo-pay.js",
    "site/preview/js/executive-overview.js",
    "site/preview/js/tabs.js",
  ]) {
    vm.runInContext(fs.readFileSync(script, "utf8"), renderSandbox);
  }

  return {
    sandbox: renderSandbox,
    elements,
    periodSelect,
    stats,
    noticeCalls,
    resetCharts() {
      stats.salesCharts = 0;
      stats.tenderCharts = 0;
    },
  };
}

async function runRenderingRegressionChecks() {
  const renderingFailures = [];
  function renderCheck(name, actual, expected) {
    if (actual !== expected) renderingFailures.push({ name, expected, actual });
  }

  const full = buildRenderingHarness();
  await full.sandbox.window.__executiveOverview.loadOverview();

  renderCheck("sales chart is constructed exactly once on load", full.stats.salesCharts, 1);
  renderCheck("tender chart is constructed exactly once on load", full.stats.tenderCharts, 1);
  renderCheck(
    "initial render shows the latest common week, not history",
    full.elements["overview-period-label"].textContent !== "Available history",
    true
  );
  renderCheck(
    "initial KPI grid shows the latest-week sales figure",
    full.elements["overview-kpis"].innerHTML.includes(model.kpis.inShopSales.display),
    true
  );
  renderCheck(
    "legend dot ink uses the WCAG-safe navy for Gift Card / Dutch Pass, not raw brand yellow",
    full.elements["legend-overview-tender"].innerHTML.includes("color:#154167") &&
      !/color:#F6E300[^>]*>●<\/span>\s*Gift Card/i.test(
        full.elements["legend-overview-tender"].innerHTML
      ),
    true
  );

  // Switch to Available history and prove it renders the aggregate, not a
  // silent no-op that keeps showing the latest week.
  full.resetCharts();
  full.sandbox.window.dispatchEvent(
    new full.sandbox.CustomEvent("dashboard:period", {
      detail: { periodId: "history", tabId: "overview" },
    })
  );

  renderCheck(
    "selecting Available history updates the period label",
    full.elements["overview-period-label"].textContent,
    "Available history"
  );
  renderCheck(
    "Available history renders the aggregated POS sales figure",
    full.elements["overview-kpis"].innerHTML.includes(historyModel.kpis.inShopSales.display),
    true
  );
  renderCheck(
    "Available history no longer shows the latest single-week POS figure",
    full.elements["overview-kpis"].innerHTML.includes(model.kpis.inShopSales.display),
    false
  );
  renderCheck("history selection re-renders the sales chart once", full.stats.salesCharts, 1);
  renderCheck("history selection re-renders the tender chart once", full.stats.tenderCharts, 1);

  // --- Review fix: switching to the overview tab (dashboard:tab) after data
  // has already loaded must rerender/rebuild the charts, even though the
  // selected period id hasn't changed. Without this, a chart built while its
  // panel was hidden (e.g. the user switched away before loadOverview()
  // finished, then switched back) stays sized to a hidden 0x0 canvas — the
  // period-echo double-render guard would otherwise skip this rebuild since
  // the resolved period id is unchanged. ---
  full.resetCharts();
  full.sandbox.window.dispatchEvent(
    new full.sandbox.CustomEvent("dashboard:tab", { detail: { tabId: "overview" } })
  );
  renderCheck(
    "activating the overview tab rebuilds the sales chart even though the period is unchanged",
    full.stats.salesCharts,
    1
  );
  renderCheck(
    "activating the overview tab rebuilds the tender chart even though the period is unchanged",
    full.stats.tenderCharts,
    1
  );
  renderCheck(
    "activating another tab does not rebuild the overview charts",
    (() => {
      full.resetCharts();
      full.sandbox.window.dispatchEvent(
        new full.sandbox.CustomEvent("dashboard:tab", { detail: { tabId: "pos" } })
      );
      return full.stats.salesCharts + full.stats.tenderCharts;
    })(),
    0
  );

  // activate() emits both dashboard:period and dashboard:tab. A changed
  // period must still build one chart pair, not one pair for each event.
  full.periodSelect.value = latestPeriodId;
  full.resetCharts();
  full.sandbox.window.__dashboardTabs.activate("overview");
  renderCheck("overview activate/register builds one sales chart", full.stats.salesCharts, 1);
  renderCheck("overview activate/register builds one tender chart", full.stats.tenderCharts, 1);

  full.periodSelect.value = "history";
  full.resetCharts();
  full.sandbox.window.__dashboardTabs.activate("overview");
  renderCheck(
    "overview activation preserves an explicit history selection",
    full.elements["overview-period-label"].textContent,
    "Available history"
  );
  renderCheck("history activation builds one sales chart", full.stats.salesCharts, 1);
  renderCheck("history activation builds one tender chart", full.stats.tenderCharts, 1);

  const expectedWithoutWorldpay = posWeeks
    .map((week) => week.sortKey)
    .filter((id) => oloWeeks.some((week) => week.sortKey === id));
  const partialHttp = buildRenderingHarness((url) => {
    if (url.includes("dashboard.json")) {
      return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
    }
    return successfulFetch(url);
  });
  await partialHttp.sandbox.window.__executiveOverview.loadOverview();
  renderCheck(
    "one failed HTTP source still registers common successful-feed periods",
    JSON.stringify(partialHttp.sandbox.window.__executiveOverviewState?.periodIds),
    JSON.stringify(expectedWithoutWorldpay)
  );
  renderCheck(
    "one failed HTTP source renders affected KPI as Not available",
    partialHttp.elements["overview-kpis"].innerHTML.includes("Not available"),
    true
  );
  renderCheck(
    "one failed HTTP source renders the grounded coverage watchlist item",
    /Worldpay.*not available/i.test(partialHttp.elements["overview-watchlist"].innerHTML),
    true
  );
  renderCheck("partial-source rendering keeps overview content visible", partialHttp.elements["overview-content"].hidden, false);
  renderCheck("partial-source rendering builds the sales chart", partialHttp.stats.salesCharts, 1);
  renderCheck("partial-source rendering builds the tender chart", partialHttp.stats.tenderCharts, 1);

  const allFailed = buildRenderingHarness((url) =>
    Promise.resolve({ ok: false, status: 503, json: async () => ({ url }) })
  );
  await allFailed.sandbox.window.__executiveOverview.loadOverview();
  renderCheck("all failed HTTP sources do not build charts", allFailed.stats.salesCharts + allFailed.stats.tenderCharts, 0);
  renderCheck("all failed HTTP sources use the structured notice renderer", allFailed.noticeCalls.length, 1);
  renderCheck("all failed HTTP sources reveal the overview empty state", allFailed.elements["overview-empty"].hidden, false);
  renderCheck("all failed HTTP sources hide the overview content", allFailed.elements["overview-content"].hidden, true);

  const preselectedHistory = buildRenderingHarness();
  preselectedHistory.periodSelect.value = "history";
  preselectedHistory.sandbox.window.dispatchEvent(
    new preselectedHistory.sandbox.CustomEvent("dashboard:period", {
      detail: { periodId: "history", tabId: "overview" },
    })
  );
  await preselectedHistory.sandbox.window.__executiveOverview.loadOverview();
  renderCheck(
    "history selected before data load remains selected after register",
    preselectedHistory.elements["overview-period-label"].textContent,
    "Available history"
  );
  renderCheck("pre-load history selection builds one sales chart", preselectedHistory.stats.salesCharts, 1);
  renderCheck("pre-load history selection builds one tender chart", preselectedHistory.stats.tenderCharts, 1);

  return renderingFailures;
}
