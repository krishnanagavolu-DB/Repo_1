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
check("logo returns home", html.includes('id="brand-home"'), true);
const tabsJs = fs.readFileSync("site/preview/js/tabs.js", "utf8");
check("logo click opens executive overview", tabsJs.includes('getElementById("brand-home")') && tabsJs.includes('activate("overview")'), true);
const healthJs = fs.readFileSync("site/preview/js/device-health.js", "utf8");
check("device header is as of the current date", healthJs.includes("As of ${currentDateLabel()}") && !healthJs.includes("Devices as of"), true);
check("overview burn down labels months", healthJs.includes("monthTickLabel") && healthJs.includes('type: "linear"'), true);
check(
  "overview burn down names the three inventory states",
  ["On hand", "In pipeline", "Projected"].every((label) => healthJs.includes(`label: "${label}"`)),
  true
);
check("shop table has a scroll cue", overview.includes('id="nso-health-scroll-cue"') && overview.includes("Scroll for more"), true);
check("coming-next cards have a slot under the live charts", overview.includes('id="overview-later"'), true);

const sandbox = {
  console,
  window: { addEventListener() {} },
  document: { addEventListener() {}, getElementById: () => null, body: { classList: { contains: () => false } } },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/device-health.js", "utf8"), sandbox);
const api = sandbox.window.__deviceHealth;
const split = api.burndownSeries({
  summary: { pipeline_end_date: "2026-04-01" },
  series: {
    firm: [
      { date: "2026-02-01", inventory: 100 },
      { date: "2026-03-01", inventory: 80 },
    ],
    projected: [
      { date: "2026-03-01", inventory: 80 },
      { date: "2026-04-01", inventory: 60 },
      { date: "2026-05-01", inventory: 20 },
    ],
  },
});
check("on hand is the firm history", split.onHand.map((point) => point.y).join(","), "100,80");
check("in pipeline runs through the pipeline end", split.inPipeline.at(-1).y, 60);
check("projected starts where the pipeline ends", split.projected[0].y, 60);
check("projected keeps the run-rate tail", split.projected.at(-1).y, 20);
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
