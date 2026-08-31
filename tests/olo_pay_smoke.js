const fs = require("fs");
const vm = require("vm");
const path = require("path");

const failures = [];

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
check("olo slide aria-label", html.includes('aria-label="Olo Pay digital approval and sales"'), true);
check("olo slide title", html.includes("OLO PAY · DIGITAL APPROVAL &amp; SALES") || html.includes("OLO PAY · DIGITAL APPROVAL & SALES"), true);
check("company owned shops only copy", html.includes("Company owned shops only"), true);
check("olo-pay.js is loaded", /src="js\/olo-pay\.js/.test(html), true);
check("no invented wallet chart id", html.includes("chart-olo-wallet"), false);
check("no invented decline chart id", html.includes("chart-olo-declines"), false);

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
vm.runInContext(fs.readFileSync(scriptPath, "utf8"), sandbox);

const olo = sandbox.window.__oloPay;
if (!olo) {
  failures.push({ name: "window.__oloPay helpers", expected: "object", actual: olo });
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const weeks = olo.normalizeOloData(raw);

check("week count", weeks.length, 11);
check("weeks sorted, latest last", weeks[weeks.length - 1].label, "Aug 24 – Aug 30, 2026");
check("oldest first", weeks[0].label, "Jun 15 – Jun 21, 2026");

const latest = weeks[weeks.length - 1];
check("latest sales format", olo.usd(latest.sales), "$5,987,969.17");
check("latest auth format", olo.authPct(latest.authRatePct), "96.78%");
check("latest orders format", olo.count(latest.orders), "529,752");
check("latest avg ticket format", olo.ticket(latest.avgTicket), "$11.30");
check("latest orders equal transactions", latest.orders, latest.transactions);
check("latest refunds", Number(latest.refunds.toFixed(2)), 1248.19);
check("latest voids", Number(latest.voids.toFixed(2)), 266.43);

const brandTotal = latest.brands.reduce((sum, row) => sum + row.amount, 0);
const brandTxns = latest.brands.reduce((sum, row) => sum + row.transactions, 0);
approx("brand amounts reconcile to sales", brandTotal, latest.sales);
check("brand transactions reconcile to orders", brandTxns, latest.orders);
check("brand order 0", latest.brands[0].label, "Visa");
check("brand order 1", latest.brands[1].label, "Mastercard");
check("brand order 2", latest.brands[2].label, "Amex");
check("brand order 3", latest.brands[3].label, "Discover");
approx("Visa amount", latest.brands[0].amount, 4357851.9);
approx("Visa share pct", latest.brands[0].pctOfSales, 72.8);
check("Visa transactions", latest.brands[0].transactions, 384203);

const ytd = olo.aggregateWeeks(weeks);
check("YTD label", ytd.label, "YTD · Jun 15 – Aug 30, 2026");
approx("YTD sales", ytd.sales, 62757174.36);
check("YTD orders", ytd.orders, 5489204);
check("YTD avg ticket", ytd.avgTicket.toFixed(2), "11.43");
check("YTD auth format", olo.authPct(ytd.authRatePct), "96.81%");
approx("YTD refunds", ytd.refunds, 12444.32);
approx("YTD voids", ytd.voids, 5594.46);
check("YTD has no wow sales", ytd.wow.salesPct, null);
check("YTD brand Visa share", olo.sharePct(ytd.brands[0].pctOfSales / 100), "72.7%");

const salesTrend = olo.trendSeries(weeks, "sales");
check("sales trend length", salesTrend.length, 11);
check("sales trend starts oldest", salesTrend[0].value, weeks[0].sales);
check("auth trend ends newest", olo.trendSeries(weeks, "auth")[10].value, latest.authRatePct);

check("find published week", olo.findWeekForPeriod(weeks, "2026-08-24").label, latest.label);
check("missing period returns null", olo.findWeekForPeriod(weeks, "2025-01-01"), null);
check("olo data start label", olo.getDataStart(weeks).startLabel, "Jun 15, 2026");
check("olo data week count", olo.getDataStart(weeks).weekCount, 11);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Olo Pay smoke checks passed");
