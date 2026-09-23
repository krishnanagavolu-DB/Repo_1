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

const labels = api.uniqueDates({
  series: {
    pipeline: [{ date: "2026-09-16", inventory: 3770 }],
    runRate: [{ date: "2026-12-01", inventory: 3700 }],
  },
  crossings: [{ date: "2026-10-15", threshold: 3000 }],
});
check("unique dates include pipeline, run-rate, and crossings", labels.join(","), "2026-09-16,2026-10-15,2026-12-01");
check("fmtInt groups thousands", api.fmtInt(3770), "3,770");

const mapped = api.seriesOnLabels(
  [
    { date: "2026-09-16", inventory: 3770 },
    { date: "2026-12-01", inventory: 3700 },
  ],
  ["2026-09-16", "2026-10-15", "2026-12-01"]
);
check("series carries forward between dated points", mapped[1], 3770);
check("series updates on the dated point", mapped[2], 3700);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("Payment devices smoke checks passed");
