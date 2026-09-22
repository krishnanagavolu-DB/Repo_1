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

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Executive overview smoke checks passed");
