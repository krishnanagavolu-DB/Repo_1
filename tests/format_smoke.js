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
  },
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/dashboard.js", "utf8"), sandbox);

const fmt = sandbox.window.__dashboardFormat;
const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) {
    failures.push({ name, expected, actual });
  }
}

const html = fs.readFileSync("site/preview/index.html", "utf8");
const posJs = fs.readFileSync("site/preview/js/pos-sales.js", "utf8");
const oloJs = fs.readFileSync("site/preview/js/olo-pay.js", "utf8");
check("POS slide label", html.includes("In-Shop Sales · Tender mix"), true);
check("Worldpay slide label", html.includes("Card Health · Approval &amp; cost"), true);
check("Olo slide label", html.includes("Order Ahead · Olo Pay &amp; Stripe"), true);
check("no visible YTD acronym", />[^<]*\bYTD\b[^<]*</.test(html), false);
check("aggregate period copy", html.includes("Available history"), true);
check(
  "default overview Ask Data blurb",
  html.includes("Executive Overview: ask about In-Shop Sales, Card Health, Order Ahead"),
  true
);
check(
  "default overview Ask Data prompt",
  html.includes('data-question="Can I add POS and Worldpay sales?"'),
  true
);
check("POS empty state uses executive label", /title: "In-Shop Sales\b/.test(posJs), true);
check("POS empty state drops old label", /title: "All payments\b/.test(posJs), false);
check("Olo empty state uses executive label", /title: "Order Ahead \(Olo Pay\)/.test(oloJs), true);
check("Olo empty state drops standalone label", /title: "Olo Pay\b/.test(oloJs), false);

// Deltas that round away at display precision must read neutral, not green.
const pointsMetric = {
  formatDelta: (d) => `${fmt.signed(d * 100, 2)} pts`,
};
const tinyGain = fmt.deltaDisplay(pointsMetric, { delta: 0.0000047 });
check("tiny positive delta text", tinyGain.text, "— 0.00 pts");
check("tiny positive delta class", tinyGain.className, "flat");

const exactZero = fmt.deltaDisplay(pointsMetric, { delta: 0 });
check("zero delta text", exactZero.text, "— 0.00 pts");
check("zero delta class", exactZero.className, "flat");

const realGain = fmt.deltaDisplay(pointsMetric, { delta: 0.0031 });
check("real gain text", realGain.text, "▲ +0.31 pts");
check("real gain class", realGain.className, "up");

const missing = fmt.deltaDisplay(pointsMetric, { delta: null });
check("missing delta text", missing.text, "—");
check("missing delta class", missing.className, "flat");

// Inverted metrics treat a decrease as an improvement.
const costMetric = {
  invertDelta: true,
  formatDelta: (d) => fmt.compactMoney(d, true),
};
check("inverted decrease class", fmt.deltaDisplay(costMetric, { delta: -1440 }).className, "up");
check("inverted increase class", fmt.deltaDisplay(costMetric, { delta: 1440 }).className, "down");

// Negative values use a plain hyphen, never a typographic minus.
const negatives = [
  fmt.signed(-1.5),
  fmt.money(-12.5, 2, true),
  fmt.compactMoney(-122230),
  fmt.compactMoney(-122230, true),
  fmt.compactCount(-5322, true),
];
for (const value of negatives) {
  if (/[\u2212\u2013\u2014]/.test(value)) {
    failures.push({ name: "negative sign", expected: "ASCII hyphen", actual: value });
  }
}
check("compact money negative", fmt.compactMoney(-122230, true), "-$122.2K");
check("compact count negative", fmt.compactCount(-5322, true), "-5K");

// Mix percentages stay at one decimal so legend columns align.
check("mix pct one decimal", fmt.mixPct(0.9473839052692881), "94.7%");
check("mix pct small", fmt.mixPct(0.000028039600543536873), "<0.1%");
check("mix pct zero", fmt.mixPct(0), "0.0%");
check("mix pct rounds", fmt.mixPct(0.04838168367016802), "4.8%");

// Wallet bucket is renamed so it cannot be confused with grouped "Other".
check("wallet label", fmt.mixLabel("Card / Other"), "Physical Card");
check("other label untouched", fmt.mixLabel("Other"), "Other");
check("apple pay untouched", fmt.mixLabel("Apple Pay"), "Apple Pay");

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Format smoke checks passed");
