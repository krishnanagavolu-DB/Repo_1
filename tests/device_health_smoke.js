const fs = require("fs");
const vm = require("vm");

const failures = [];
function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const html = fs.readFileSync("site/preview/index.html", "utf8");
const overview = html.slice(html.indexOf('id="panel-overview"'), html.indexOf('id="panel-pos"'));
check("device health sits above performance health", overview.indexOf("Payment device health") < overview.indexOf("Payment performance health"), true);
check("nso columns are present", ["Verifone to Stratix", "Stratix to shop", "First tamper check"].every((label) => overview.includes(label)), true);
check("burn down opens the devices tab", html.includes('id="burndown-jump"') && html.includes("chart-overview-burndown"), true);
check("device health script is loaded", html.includes('src="js/device-health.js'), true);
check("landing tab is still executive overview", /class="tab active"[^>]*data-tab="overview"/.test(html), true);

const sandbox = {
  console,
  window: { addEventListener() {} },
  document: { addEventListener() {}, getElementById: () => null, body: { classList: { contains: () => false } } },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/device-health.js", "utf8"), sandbox);
const api = sandbox.window.__deviceHealth;
const shops = [
  { id: "A", opening_date: "2026-10-19" },
  { id: "B", opening_date: "2026-10-25" },
  { id: "C", opening_date: "2026-10-26" },
];
check("week is Monday through Sunday", api.shopsForWeek(shops, "2026-10-19").map((shop) => shop.id).join(","), "A,B");
check("history is not a shop week", api.shopsForWeek(shops, "history").length, 0);
const looked = api.openingsForPeriod(shops, "2026-10-12");
check("an empty week looks ahead two weeks", looked.shops.map((shop) => shop.id).join(","), "A,B,C");
check("the look-ahead is labeled as extended", looked.extended, true);
check("a week that has openings stays on that week", api.openingsForPeriod(shops, "2026-10-19").extended, false);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("Device health smoke checks passed");
