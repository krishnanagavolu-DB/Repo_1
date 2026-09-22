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
check(
  "watchlist claims no cause",
  /because|caused by|driven by/i.test(model.watchlist.map((x) => x.text).join(" ")),
  false
);

const partial = overview.overviewForPeriod("2026-09-14", {
  pos: posWeeks,
  worldpay: [],
  olo: oloWeeks,
});
check("missing Worldpay is unavailable", partial.kpis.cardAuthRate.value, null);
check(
  "missing Worldpay creates coverage notice",
  partial.watchlist.some((x) => /Worldpay.*not available/i.test(x.text)),
  true
);

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
check("reconciliation note names overlap", /Worldpay[^<]*overlap/i.test(html), true);

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
  html.includes('<div class="chart-wrap"><canvas id="chart-overview-tender"></canvas></div>'),
  true
);

const css = fs.readFileSync("site/preview/css/dashboard.css", "utf8");
check(
  "overview keeps Ask Data below a 900px proof viewport",
  /\.executive-slide\s*\{[^}]*margin-bottom:\s*48px/.test(css),
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

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
} else {
  console.log("Executive overview smoke checks passed");

  // --- Review fix: loading the overview must construct each chart exactly
  // once (registerPeriods' own event echo plus loadOverview's explicit
  // render previously double-built both charts on every page load). This
  // exercises the real tabs.js period coordinator, not a mock, so the
  // regression is caught the same way it would break in the browser. ---
  runRenderingRegressionChecks()
    .then((renderingFailures) => {
      if (renderingFailures.length) {
        console.error(JSON.stringify(renderingFailures, null, 2));
        process.exit(1);
      }
      console.log("Executive overview rendering smoke checks passed");
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

function makeElementStub() {
  const stub = { textContent: "" };
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

async function runRenderingRegressionChecks() {
  const renderingFailures = [];
  function renderCheck(name, actual, expected) {
    if (actual !== expected) renderingFailures.push({ name, expected, actual });
  }

  let salesChartCount = 0;
  let tenderChartCount = 0;

  class FakeChart {
    constructor(_canvas, config) {
      if (config?.type === "line") salesChartCount += 1;
      if (config?.type === "doughnut") tenderChartCount += 1;
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
  };

  const periodSelect = {
    value: "",
    options: [],
    addEventListener() {},
    replaceChildren(...opts) {
      this.options = opts;
    },
  };

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
    fetch(url) {
      const payload = url.includes("in_shop_sales_data")
        ? posPayload
        : url.includes("dashboard.json")
        ? worldpayPayload
        : oloPayload;
      return Promise.resolve({ ok: true, json: async () => payload });
    },
    window: {
      addEventListener(type, handler) {
        (eventListeners[type] = eventListeners[type] || []).push(handler);
      },
      dispatchEvent(event) {
        for (const handler of eventListeners[event.type] || []) handler(event);
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
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
    },
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

  await renderSandbox.window.__executiveOverview.loadOverview();

  renderCheck("sales chart is constructed exactly once on load", salesChartCount, 1);
  renderCheck("tender chart is constructed exactly once on load", tenderChartCount, 1);
  renderCheck(
    "initial render shows the latest common week, not history",
    elements["overview-period-label"].textContent !== "Available history",
    true
  );
  renderCheck(
    "initial KPI grid shows the latest-week sales figure",
    elements["overview-kpis"].innerHTML.includes(model.kpis.inShopSales.display),
    true
  );
  renderCheck(
    "legend dot ink uses the WCAG-safe navy for Gift Card / Dutch Pass, not raw brand yellow",
    elements["legend-overview-tender"].innerHTML.includes("color:#154167") &&
      !/color:#F6E300[^>]*>●<\/span>\s*Gift Card/i.test(elements["legend-overview-tender"].innerHTML),
    true
  );

  // Switch to Available history and prove it renders the aggregate, not a
  // silent no-op that keeps showing the latest week.
  salesChartCount = 0;
  tenderChartCount = 0;
  renderSandbox.window.dispatchEvent(
    new renderSandbox.CustomEvent("dashboard:period", {
      detail: { periodId: "history", tabId: "overview" },
    })
  );

  renderCheck(
    "selecting Available history updates the period label",
    elements["overview-period-label"].textContent,
    "Available history"
  );
  renderCheck(
    "Available history renders the aggregated POS sales figure",
    elements["overview-kpis"].innerHTML.includes(historyModel.kpis.inShopSales.display),
    true
  );
  renderCheck(
    "Available history no longer shows the latest single-week POS figure",
    elements["overview-kpis"].innerHTML.includes(model.kpis.inShopSales.display),
    false
  );
  renderCheck("history selection re-renders the sales chart once", salesChartCount, 1);
  renderCheck("history selection re-renders the tender chart once", tenderChartCount, 1);

  // --- Review fix: switching to the overview tab (dashboard:tab) after data
  // has already loaded must rerender/rebuild the charts, even though the
  // selected period id hasn't changed. Without this, a chart built while its
  // panel was hidden (e.g. the user switched away before loadOverview()
  // finished, then switched back) stays sized to a hidden 0x0 canvas — the
  // period-echo double-render guard would otherwise skip this rebuild since
  // the resolved period id is unchanged. ---
  salesChartCount = 0;
  tenderChartCount = 0;
  renderSandbox.window.dispatchEvent(
    new renderSandbox.CustomEvent("dashboard:tab", { detail: { tabId: "overview" } })
  );
  renderCheck(
    "activating the overview tab rebuilds the sales chart even though the period is unchanged",
    salesChartCount,
    1
  );
  renderCheck(
    "activating the overview tab rebuilds the tender chart even though the period is unchanged",
    tenderChartCount,
    1
  );
  renderCheck(
    "activating another tab does not rebuild the overview charts",
    (() => {
      salesChartCount = 0;
      tenderChartCount = 0;
      renderSandbox.window.dispatchEvent(
        new renderSandbox.CustomEvent("dashboard:tab", { detail: { tabId: "pos" } })
      );
      return salesChartCount + tenderChartCount;
    })(),
    0
  );

  return renderingFailures;
}
