/* The available-history banner tells leadership how far back the aggregate
   reaches on whichever tab they are looking at. */

const fs = require("fs");
const vm = require("vm");

const sandbox = {
  console,
  String,
  Object,
  Array,
  Number,
  window: { addEventListener() {}, dispatchEvent() {} },
  document: {
    addEventListener() {},
    getElementById: () => null,
    querySelector: () => null,
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/ytd-banner.js", "utf8"), sandbox);

const banner = sandbox.window.__ytdBanner;
const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

check(
  "All payments coverage",
  banner.buildMessage({ startLabel: "Jul 27, 2026", weekCount: 3 }),
  "Available history: every certified week since Jul 27, 2026 — 3 weeks loaded."
);

check(
  "single week stays grammatical",
  banner.buildMessage({ startLabel: "Aug 10, 2026", weekCount: 1 }),
  "Available history: every certified week since Aug 10, 2026 — 1 week loaded."
);

// Card present reaches back further than All payments, so each tab reports its own start.
check(
  "Card present coverage",
  banner.buildMessage({ startLabel: "Jul 20, 2026", weekCount: 4 }),
  "Available history: every certified week since Jul 20, 2026 — 4 weeks loaded."
);
check(
  "message does not contain YTD",
  banner.buildMessage({ startLabel: "Jul 27, 2026", weekCount: 3 }).includes("YTD"),
  false
);

// Without a registered start date we say nothing rather than guess a date.
check("no coverage yields no message", banner.buildMessage(null), null);
check("missing start date yields no message", banner.buildMessage({ weekCount: 3 }), null);

// Tabs register their own coverage and the banner reads back the active one.
banner.register("pos", { startLabel: "Jul 27, 2026", weekCount: 3 });
banner.register("worldpay", { startLabel: "Jul 20, 2026", weekCount: 4 });
check("registered pos start", banner.getCoverage("pos").startLabel, "Jul 27, 2026");
check("registered worldpay weeks", banner.getCoverage("worldpay").weekCount, 4);
check("unknown tab has no coverage", banner.getCoverage("olo"), null);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Available history banner smoke checks passed");
