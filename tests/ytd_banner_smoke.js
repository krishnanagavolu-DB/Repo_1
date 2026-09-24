/* The YTD banner tells leadership how far back the aggregate reaches,
   in Dutch Bros voice, on whichever tab they are looking at. */

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
  "Fresh pour: YTD stacks up every week since Jul 27, 2026 — 3 weeks in the cup so far."
);

check(
  "single week stays grammatical",
  banner.buildMessage({ startLabel: "Aug 10, 2026", weekCount: 1 }),
  "Fresh pour: YTD stacks up every week since Aug 10, 2026 — 1 week in the cup so far."
);

// Card present reaches back further than All payments, so each tab reports its own start.
check(
  "Card present coverage",
  banner.buildMessage({ startLabel: "Jul 20, 2026", weekCount: 4 }),
  "Fresh pour: YTD stacks up every week since Jul 20, 2026 — 4 weeks in the cup so far."
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

console.log("YTD banner smoke checks passed");
