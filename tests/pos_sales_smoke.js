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
  window: {},
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

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("POS sales smoke checks passed");
