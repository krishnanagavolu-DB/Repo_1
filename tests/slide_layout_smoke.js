const fs = require("fs");
const vm = require("vm");

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const html = fs.readFileSync("site/preview/index.html", "utf8");
check("In-Shop Sales slide aria label", html.includes('aria-label="In-Shop Sales tender mix"'), true);
check("Card Health slide aria label", html.includes('aria-label="Card Health approval and cost"'), true);
check("Order Ahead slide aria label", html.includes('aria-label="Order Ahead Olo Pay and Stripe"'), true);
check("All payments sales trend canvas", html.includes('id="chart-pos-sales-trend"'), true);
check("All payments payments trend canvas", html.includes('id="chart-pos-payments-trend"'), true);
check("actionable decline heading", html.includes("Actionable decline reasons"), true);
check("In-Shop Sales nav", html.includes(">In-Shop Sales</button>"), true);
check("Card Health nav", html.includes(">Card Health</button>"), true);
check("Order Ahead nav", html.includes(">Order Ahead</button>"), true);
check("Payment Devices nav", html.includes(">Payment Devices</button>"), true);
check("Payment Devices slide aria label", html.includes('aria-label="Verifone e285 lifecycle burndown"'), true);
check("lifecycle callout exists", html.includes('id="devices-gap-callout"'), true);

const labelsRef = html.indexOf('src="js/chart-labels.js');
const dashboardRef = html.indexOf('src="js/dashboard.js');
const posRef = html.indexOf('src="js/pos-sales.js');
check("chart labels script is loaded", labelsRef >= 0, true);
check("chart labels loads before dashboard", labelsRef < dashboardRef, true);
check("chart labels loads before POS", labelsRef < posRef, true);

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
  Chart: { register() {} },
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
vm.runInContext(fs.readFileSync("site/preview/js/chart-labels.js", "utf8"), sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/dashboard.js", "utf8"), sandbox);

const labels = sandbox.window.__chartLabels;
check("compact money label", labels.compactMoney(1372328), "$1.4M");
check("compact count label", labels.compactCount(21913), "21.9K");
check("percent label", labels.percent(0.9857966), "98.58%");

const actionable = sandbox.window.__dashboardFormat.actionableDeclines([
  { label: "Decline", count: 21913 },
  { label: "Do not honor", count: 1407 },
  { label: "Suspected fraud", count: 1181 },
]);
check("generic decline excluded from actionable chart", actionable.some((row) => row.label === "Decline"), false);
check("actionable list keeps coded reasons", actionable[0].label, "Do not honor");

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Slide layout and visible-label checks passed");
