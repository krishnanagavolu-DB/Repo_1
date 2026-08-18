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
vm.runInContext(fs.readFileSync("site/preview/js/pos-sales.js", "utf8"), sandbox);

const pos = sandbox.window.__posSales;
const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const sample = JSON.parse(fs.readFileSync("tests/fixtures/pos_sales_sample.json", "utf8"));
const weeks = pos.normalizePosData(sample);

check("week count", weeks.length, 3);
check("weeks sorted, latest last", weeks[weeks.length - 1].label, "Aug 10 – Aug 16, 2026");

const latest = weeks[weeks.length - 1];
check("tender count", latest.tenders.length, 3);
check("tender order 0", latest.tenders[0].label, "Card");
check("tender order 1", latest.tenders[1].label, "Cash");
check("tender order 2", latest.tenders[2].label, "Gift Card / Dutch Pass");

// Shares are derived when the export omits them, and must sum to 100%.
const shareSum = latest.tenders.reduce((sum, t) => sum + t.pct, 0);
if (Math.abs(shareSum - 1) > 0.000001) {
  failures.push({ name: "shares sum to 1", expected: 1, actual: shareSum });
}
check("card share", pos.sharePct(latest.tenders[0].pct), "86.6%");
check("currency format", pos.usd(1234567.89), "$1,234,567.89");
check("missing shops", latest.coverage.missingCount, 3);
if (!latest.coverage.note) failures.push({ name: "coverage note", expected: "present", actual: latest.coverage.note });

// A bare array of weeks is also accepted.
const bare = pos.normalizePosData(sample.weeks);
check("bare array weeks", bare.length, 3);

// Percentages supplied as 0-100 are converted to fractions.
const withPercents = pos.normalizeTenderMix([
  { label: "Card", amount: 80, pct: 80 },
  { label: "Cash", amount: 20, pct: 20 },
]);
check("percent scaled", withPercents.rows[0].pct, 0.8);

// Keyed-object tender maps normalize too.
const keyed = pos.normalizeTenderMix({ Card: 75, Cash: 25 });
check("keyed rows", keyed.rows.length, 2);
check("keyed derived share", keyed.rows[0].pct, 0.75);

// Nothing usable must yield zero weeks so the UI shows an empty state, not zeros.
check("empty input", pos.normalizePosData({}).length, 0);
check("null tender mix", pos.normalizePosData([{ week_start: "2026-08-10" }]).length, 0);

// The Snowflake export uses its own key names and puts shop_coverage at the root.
const snowflake = pos.normalizePosData(
  JSON.parse(fs.readFileSync("tests/fixtures/pos_sales_snowflake_shape.json", "utf8"))
);
check("snowflake week count", snowflake.length, 2);
const sfLatest = snowflake[snowflake.length - 1];
check("snowflake week label", sfLatest.label, "Aug 10 – Aug 16, 2026");
check("snowflake reported total", sfLatest.reportedTotal, 1200);
check("snowflake transactions", sfLatest.transactions, 120);
check("snowflake avg ticket", sfLatest.avgTicket, 10);
check("snowflake tender order", sfLatest.tenders[0].label, "Card");
check("snowflake supplied share", pos.sharePct(sfLatest.tenders[0].pct), "70.0%");
check("root coverage applied to each week", sfLatest.coverage.missingCount, 313);
check("compact millions", pos.compactUsd(31681899.99), "$31.7M");
check("compact thousands", pos.compactUsd(7358837.24), "$7.4M");
check("missing WoW stays blank", pos.wowLabel(null), null);

const live = pos.normalizePosData(
  JSON.parse(fs.readFileSync("site/preview/data/in_shop_sales_data.json", "utf8"))
);
const liveLatest = live[live.length - 1];
check("live wow sales", liveLatest.wow.salesPct, -2.1);
check("gift split parts", liveLatest.giftSplit.parts.length, 2);
check("gift split gift label", liveLatest.giftSplit.parts[0].label, "Gift Card");
check("dutch pass label", liveLatest.giftSplit.parts[1].label, "Dutch Pass");
const giftShare = liveLatest.giftSplit.parts.reduce((sum, p) => sum + p.pct, 0);
if (Math.abs(giftShare - 1) > 0.000001) {
  failures.push({ name: "gift split sums to 1", expected: 1, actual: giftShare });
}

// YTD means the aggregate of every week held by All payments.
const liveYtd = pos.aggregateWeeks(live);
check("YTD label", liveYtd.label, "YTD · Jul 27 – Aug 16, 2026");
check("YTD total sales", liveYtd.reportedTotal, 138569865.15);
check("YTD tender total reconciles", liveYtd.tenderTotal, 138569865.15);
check("YTD transactions", liveYtd.transactions, 13825173);
check("YTD avg ticket", liveYtd.avgTicket.toFixed(2), "10.02");
check("YTD card dollars", liveYtd.tenders[0].amount, 95661242.92);
check("YTD card share", pos.sharePct(liveYtd.tenders[0].pct), "69.0%");
check("YTD cash dollars", liveYtd.tenders[1].amount, 22352115.8);
check("YTD gift/Dutch Pass dollars", liveYtd.tenders[2].amount, 20556506.43);
check("YTD Gift Card dollars", liveYtd.giftSplit.parts[0].amount, 13724812.45);
check("YTD Dutch Pass dollars", liveYtd.giftSplit.parts[1].amount, 6831693.98);
check("YTD has no week-over-week sales delta", liveYtd.wow.salesPct, null);
check("live orderCount absent until rebuild", liveLatest.orderCount, null);
check("live avgTicketBasis absent until rebuild", liveLatest.avgTicketBasis, null);

// Next-publish shape: ORDER_COUNT + AVG_TICKET_BASIS = distinct_ORDER_ID.
const withOrders = pos.normalizePosData({
  weeks: [
    {
      week_start: "2026-08-17",
      week_end: "2026-08-23",
      label: "Aug 17 – Aug 23, 2026",
      totals: {
        SALES_VOLUME: 1000,
        TRANSACTION_COUNT: 120,
        ORDER_COUNT: 100,
        AVG_TICKET: 10,
        AVG_TICKET_BASIS: "distinct_ORDER_ID",
      },
      tender_mix: [
        { label: "Card", amount: 700 },
        { label: "Cash", amount: 200 },
        { label: "Gift Card / Dutch Pass", amount: 100 },
      ],
    },
  ],
});
check("orderCount from totals", withOrders[0].orderCount, 100);
check("avgTicketBasis from totals", withOrders[0].avgTicketBasis, "distinct_ORDER_ID");
check("avgTicket prefers published field", withOrders[0].avgTicket, 10);

const orderYtd = pos.aggregateWeeks(withOrders);
check("YTD orderCount", orderYtd.orderCount, 100);
check("YTD avgTicket uses orders when basis is ORDER_ID", orderYtd.avgTicket, 10);
check("YTD avgTicketBasis", orderYtd.avgTicketBasis, "distinct_ORDER_ID");

// Sparkline series for the summary cards, oldest week first.
const salesTrend = pos.trendSeries(live, "sales");
check("sales trend length", salesTrend.length, 3);
check("sales trend starts oldest", salesTrend[0].value, 45989528.17);
check("sales trend ends newest", salesTrend[2].value, 45799722.66);
check("sales trend label", salesTrend[0].label, "Jul 27 – Aug 2, 2026");

const paymentsTrend = pos.trendSeries(live, "payments");
check("payments trend length", paymentsTrend.length, 3);
check("payments trend first", paymentsTrend[0].value, 4548240);
check("payments trend last", paymentsTrend[2].value, 4594352);

// One week cannot form a line, so no series is offered.
check("single week has no trend", pos.trendSeries([live[0]], "sales").length, 0);
check("unknown metric has no trend", pos.trendSeries(live, "nope").length, 0);

// The data start feeds the YTD banner.
check("pos data start", pos.getDataStart(live).startLabel, "Jul 27, 2026");
check("pos data week count", pos.getDataStart(live).weekCount, 3);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("POS sales smoke checks passed");
