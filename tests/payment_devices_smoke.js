const fs = require("fs");
const vm = require("vm");

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const html = fs.readFileSync("site/preview/index.html", "utf8");
check("Payment Devices tab exists", html.includes('data-tab="devices"'), true);
check("Payment Devices panel exists", html.includes('data-panel="devices"'), true);
check("burndown canvas exists", html.includes('id="chart-devices-burndown"'), true);
check("live facts list exists", html.includes('id="devices-live"'), true);
check("assumptions list exists", html.includes('id="devices-assumptions"'), true);
check("payment-devices script is loaded", html.includes('src="js/payment-devices.js'), true);

const source = fs.readFileSync("site/preview/js/payment-devices.js", "utf8");
const sandbox = {
  console,
  Chart: { register() {} },
  window: { addEventListener() {}, dispatchEvent() {}, __dashboardAuth: { loadJson: async () => ({}) } },
  document: {
    addEventListener() {},
    getElementById() {
      return null;
    },
    body: { classList: { contains() { return false; } } },
  },
  CustomEvent: class CustomEvent {},
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.window.__paymentDevices;

check("fmtInt groups thousands", api.fmtInt(5700), "5,700");

// A category axis spaces points evenly by index, which distorts a 29-month
// timeline built from daily history plus weekly projection. Points carry
// real timestamps so the x axis stays proportional to elapsed time.
const points = api.pointsFor([
  { date: "2026-02-01", inventory: 5700 },
  { date: "2026-09-24", inventory: 3760 },
]);
check("points carry numeric timestamps", typeof points[0].x, "number");
check("points keep inventory on y", points[1].y, 3760);
check(
  "timestamps are proportional to elapsed days",
  Math.round((points[1].x - points[0].x) / 86400000),
  235
);
check("toMs parses an ISO day", api.toMs("2026-02-01"), new Date(2026, 1, 1).getTime());

const ticks = api.monthTicks(new Date(2026, 1, 1).getTime(), new Date(2026, 7, 1).getTime(), 3);
check("month ticks step by quarter", ticks.length, 3);
check("first tick is the baseline month", api.monthLabel(ticks[0]), "Feb 2026");
check(
  "scope assumption is rendered from payload text",
  fs.readFileSync("site/preview/js/payment-devices.js", "utf8").includes(
    "Company-Owned and Franchise/Boersma locations combined"
  ),
  true
);

check(
  "crossing labels are drawn clear of the x-axis ticks",
  source.includes("rotate(-Math.PI / 2)"),
  true
);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("Payment devices smoke checks passed");
