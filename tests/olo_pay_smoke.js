const fs = require("fs");
const vm = require("vm");

const failures = [];
const windowListeners = {};

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

function approx(name, actual, expected, digits = 2) {
  const a = Number(actual);
  const e = Number(expected);
  if (!Number.isFinite(a) || Math.abs(a - e) > Math.pow(10, -digits) / 2) {
    failures.push({ name, expected, actual });
  }
}

const htmlPath = "site/preview/index.html";
const scriptPath = "site/preview/js/olo-pay.js";
const dataPath = "site/preview/data/olo_pay_data.json";

const html = fs.readFileSync(htmlPath, "utf8");
check('preview exposes data-tab="olo"', html.includes('data-tab="olo"'), true);
check("preview panel data-panel=olo", html.includes('data-panel="olo"'), true);
check("panel-olo id", html.includes('id="panel-olo"'), true);
check("olo-empty id", html.includes('id="olo-empty"'), true);
check("olo-content id", html.includes('id="olo-content"'), true);
check("olo-period-label id", html.includes('id="olo-period-label"'), true);
check("olo-summary-grid id", html.includes('id="olo-summary-grid"'), true);
check("olo-support id", html.includes('id="olo-support"'), true);
check("chart-olo-sales-trend id", html.includes('id="chart-olo-sales-trend"'), true);
check("chart-olo-auth-trend id", html.includes('id="chart-olo-auth-trend"'), true);
check("chart-olo-brand id", html.includes('id="chart-olo-brand"'), true);
check("legend-olo-brand id", html.includes('id="legend-olo-brand"'), true);
check("olo-detail id", html.includes('id="olo-detail"'), true);
check("olo detail uses olo-charts class", html.includes("olo-charts"), true);
check("olo slide aria-label", html.includes('aria-label="Order Ahead Olo Pay and Stripe"'), true);
check("olo slide title", html.includes("Order Ahead · Olo Pay &amp; Stripe"), true);
check("company owned shops only copy", html.includes("Company owned shops only"), true);
check("olo-pay.js is loaded", /src="js\/olo-pay\.js/.test(html), true);

const labelsRef = html.indexOf('src="js/chart-labels.js');
const oloRef = html.indexOf('src="js/olo-pay.js');
check("chart-labels.js is loaded", labelsRef >= 0, true);
check("chart-labels.js loads before olo-pay.js", labelsRef >= 0 && oloRef > labelsRef, true);

check("no invented wallet chart id", html.includes("chart-olo-wallet"), false);
check("no invented decline chart id", html.includes("chart-olo-declines"), false);

const css = fs.readFileSync("site/preview/css/dashboard.css", "utf8");
const charts2Idx = css.search(/\.charts-2\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/);
const oloOverrideIdx = css.search(
  /\.charts-2\.olo-charts\s*\{[^}]*grid-template-columns:\s*1fr(?:\s|;|\n|\})/
);
check("olo full-width uses charts-2.olo-charts compound", oloOverrideIdx >= 0, true);
check(
  "olo full-width compound follows .charts-2 so it cannot lose",
  charts2Idx >= 0 && oloOverrideIdx > charts2Idx,
  true
);
check("olo support row uses --line token", /\.olo-support-row\s*\{[^}]*border-bottom:\s*1px dotted var\(--line\)/.test(css), true);

if (!fs.existsSync(scriptPath)) {
  failures.push({ name: "olo-pay.js exists", expected: scriptPath, actual: "missing" });
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

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
  window: {
    addEventListener(type, handler) {
      windowListeners[type] = handler;
    },
    dispatchEvent() {},
  },
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
vm.runInContext(fs.readFileSync(scriptPath, "utf8"), sandbox);

const olo = sandbox.window.__oloPay;
if (!olo) {
  failures.push({ name: "window.__oloPay helpers", expected: "object", actual: olo });
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const weeks = olo.normalizeOloData(raw);

check("week count", weeks.length, 14);
check("weeks sorted, latest last", weeks[weeks.length - 1].label, "Sep 14 – Sep 20, 2026");
check("oldest first", weeks[0].label, "Jun 15 – Jun 21, 2026");

const latest = weeks[weeks.length - 1];
check("latest sales format", olo.usd(latest.sales), "$5,581,687.75");
check("latest auth format", olo.authPct(latest.authRatePct), "96.62%");
check("latest orders format", olo.count(latest.orders), "541,049");
check("latest avg ticket format", olo.ticket(latest.avgTicket), "$10.32");
check("latest orders equal transactions", latest.orders, latest.transactions);
check("latest refunds", Number(latest.refunds.toFixed(2)), 1278.36);
check("latest voids", Number(latest.voids.toFixed(2)), 294.34);

const brandTotal = latest.brands.reduce((sum, row) => sum + row.amount, 0);
const brandTxns = latest.brands.reduce((sum, row) => sum + row.transactions, 0);
approx("brand amounts reconcile to sales", brandTotal, latest.sales);
check("brand transactions reconcile to orders", brandTxns, latest.orders);
check("brand order 0", latest.brands[0].label, "Visa");
check("brand order 1", latest.brands[1].label, "Mastercard");
check("brand order 2", latest.brands[2].label, "Amex");
check("brand order 3", latest.brands[3].label, "Discover");
approx("Visa amount", latest.brands[0].amount, 4057761.8);
approx("Visa share pct", latest.brands[0].pctOfSales, 72.7);
check("Visa transactions", latest.brands[0].transactions, 391606);

const ytd = olo.aggregateWeeks(weeks);
check("history label", ytd.label, "Available history · Jun 15 – Sep 20, 2026");
check("history sort key", ytd.sortKey, "history");
check("history id accepted", olo.isHistoryPeriod("history"), true);
check("legacy ytd id accepted", olo.isHistoryPeriod("ytd"), true);
approx("YTD sales", ytd.sales, 75237215.10);
check("YTD orders", ytd.orders, 7104253);
check("YTD avg ticket", ytd.avgTicket.toFixed(2), "10.59");
check("YTD auth format", olo.authPct(ytd.authRatePct), "96.79%");
approx("YTD refunds", ytd.refunds, 15208.85);
approx("YTD voids", ytd.voids, 6238.86);
check("YTD has no wow sales", ytd.wow.salesPct, null);
check("YTD brand Visa share", olo.sharePct(ytd.brands[0].pctOfSales / 100), "72.7%");

const salesTrend = olo.trendSeries(weeks, "sales");
check("sales trend length", salesTrend.length, 14);
check("sales trend starts oldest", salesTrend[0].value, weeks[0].sales);
check("auth trend ends newest", olo.trendSeries(weeks, "auth")[13].value, latest.authRatePct);

check("find published week", olo.findWeekForPeriod(weeks, "2026-09-14").label, latest.label);
check("missing period returns null", olo.findWeekForPeriod(weeks, "2025-01-01"), null);
check("olo data start label", olo.getDataStart(weeks).startLabel, "Jun 15, 2026");
check("olo data week count", olo.getDataStart(weeks).weekCount, 14);

const oloJs = fs.readFileSync(scriptPath, "utf8");
check(
  "supporting totals use th scope=row",
  oloJs.includes('<th scope="row">Refunds</th>') && oloJs.includes('<th scope="row">Voids</th>'),
  true
);
check("supporting Digital sales uses th scope=row", oloJs.includes('<th scope="row">Digital sales</th>'), true);
check("unused orders trend metric removed", /orders:\s*\(week\)\s*=>\s*week\.orders/.test(oloJs), false);
check(
  "orders does not fall back to transactions",
  !/orders:\s*Number\.isFinite\(orders\)\s*\?\s*orders\s*:\s*transactions/.test(oloJs),
  true
);

const missingOrders = olo.normalizeOloData({
  weeks: [
    {
      week_start_date: "2026-08-24",
      week_end_date: "2026-08-30",
      totals: {
        SALES_VOLUME: 100,
        TRANSACTION_COUNT: 10,
        AVG_TICKET: 10,
      },
      authorization: { approved: 10, declined: 0, failed: 0, auth_rate_pct: 100 },
      card_brand_mix: {
        Visa: { amount: 100, pct_of_digital_sales: 100, TRANSACTION_COUNT: 10 },
      },
    },
  ],
});
check("missing ORDER_COUNT stays null", missingOrders[0]?.orders, null);
check(
  "missing ORDER_COUNT is not inferred from transactions",
  missingOrders[0]?.orders === missingOrders[0]?.transactions,
  false
);

const oloSrc = fs.readFileSync(scriptPath, "utf8");
check(
  "brand legend bullets are aria-hidden",
  /aria-hidden="true"[^>]*>●|●[^<]*aria-hidden="true"|<span[^>]*aria-hidden="true"[^>]*>●/.test(oloSrc),
  true
);
check(
  "empty trend series destroys stale charts before return",
  /if\s*\(\s*trendCharts\[metric\]\s*\)\s*trendCharts\[metric\]\.destroy\(\)\s*;\s*\n\s*if\s*\([^)]*series\.length/.test(oloSrc)
    || /trendCharts\[metric\]\.destroy\(\)[\s\S]{0,120}!series\.length/.test(oloSrc)
    || /if\s*\(!series\.length\)[\s\S]{0,80}destroy\(\)/.test(oloSrc)
    || /destroy\(\)[\s\S]{0,80}if\s*\(!canvas[\s\S]{0,60}!series\.length/.test(oloSrc),
  true
);

const renderElements = {
  "olo-period-label": { textContent: "" },
  "olo-summary-grid": { innerHTML: "" },
  "olo-support": { innerHTML: "" },
  "olo-detail": { innerHTML: "" },
  "olo-empty": { hidden: true },
  "olo-content": { hidden: true },
};
sandbox.document.getElementById = (id) => renderElements[id] || null;
sandbox.window.__oloPayState = { weeks, latest, methodology: null };
const olderOverviewWeek = weeks.at(-2);
renderElements["olo-period-label"].textContent = "hidden Olo panel sentinel";
renderElements["olo-summary-grid"].innerHTML = "hidden Olo summary sentinel";
windowListeners["dashboard:period"]?.({
  detail: { tabId: "overview", periodId: olderOverviewWeek.sortKey },
});
check(
  "Overview week selection updates the Olo chatbot getter",
  olo.getSelectedWeek()?.sortKey,
  olderOverviewWeek.sortKey
);
check(
  "Overview week selection does not render the hidden Olo period",
  renderElements["olo-period-label"].textContent,
  "hidden Olo panel sentinel"
);
check(
  "Overview week selection does not rebuild the hidden Olo summary",
  renderElements["olo-summary-grid"].innerHTML,
  "hidden Olo summary sentinel"
);

windowListeners["dashboard:period"]?.({
  detail: { tabId: "overview", periodId: "history" },
});
check("Overview history selection updates the Olo getter to its aggregate", olo.getSelectedWeek()?.sortKey, "history");
check(
  "Overview history selection still does not render the hidden Olo panel",
  renderElements["olo-period-label"].textContent,
  "hidden Olo panel sentinel"
);

windowListeners["dashboard:period"]?.({
  detail: { tabId: "pos", periodId: latest.sortKey },
});
check("unrelated tab period remains ignored by Olo", olo.getSelectedWeek()?.sortKey, "history");

windowListeners["dashboard:period"]?.({
  detail: { tabId: "olo", periodId: olderOverviewWeek.sortKey },
});
check("Olo tab period still updates its getter", olo.getSelectedWeek()?.sortKey, olderOverviewWeek.sortKey);
check("Olo tab period still renders normally", renderElements["olo-period-label"].textContent, olderOverviewWeek.label);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Olo Pay smoke checks passed");
