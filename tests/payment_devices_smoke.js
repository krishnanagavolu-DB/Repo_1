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
check("assumptions grid exists", html.includes('id="devices-assumptions"'), true);
check("payment-devices script is loaded", html.includes('src="js/payment-devices.js'), true);

// Leadership reads the headline numbers before the chart, so they are cards,
// not a paragraph underneath it.
check("KPI ribbon exists", html.includes('id="devices-ribbon"'), true);
check("past present future groups exist", html.includes('class="devices-eras"') && html.includes("devices-era-past") && html.includes("devices-era-future"), true);
check("contract and opened cards exist", html.includes('id="devices-kpi-contract"') && html.includes('id="devices-kpi-opened"'), true);
check("present and future cards exist", html.includes('id="devices-kpi-planned"') && html.includes('id="devices-kpi-remaining"'), true);

// The run-rate control models a different opening speed without a reimport.
check("run-rate slider exists", html.includes('id="devices-runrate"'), true);
check("run-rate range floor is half a shop", html.includes('min="0.5"'), true);
check("run-rate range ceiling is ten shops", html.includes('max="10"'), true);
check("run-rate steps by half a shop", html.includes('step="0.5"'), true);
check("run-rate has decrement and increment", html.includes('id="devices-runrate-down"') && html.includes('id="devices-runrate-up"'), true);
check("card uses requested projected exhaustion label", html.includes(">Proj Exhaution<"), true);
check("chart uses requested title", html.includes(">Verifone E285 Burndown Chart<"), true);
check("control is labelled PO run rate", html.includes(">PO Run-Rate<"), true);

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
// Scope is the assumption executives most often get wrong, so the grid must
// keep saying both entity types draw from the same pool.
check(
  "scope assumption names both entity types",
  /company-owned and franchise\/boersma/i.test(source),
  true
);

check(
  "crossing labels are drawn clear of the x-axis ticks",
  source.includes("rotate(-Math.PI / 2)"),
  true
);

// The dashed line is recomputed in the browser so the slider is instant. It
// must still land exactly where the importer put it at the default 5.5.
const payload = JSON.parse(fs.readFileSync("data/processed/payment_devices.json", "utf8"));
const baseline = api.projectSeries(payload, payload.assumptions.shops_per_week);
check("default run rate reproduces the certified zero date", baseline.zeroDate, payload.summary.zero_date);
check(
  "default run rate reproduces the certified crossings",
  JSON.stringify(baseline.crossings.map((row) => [row.threshold, row.date])),
  JSON.stringify((payload.crossings || []).map((row) => [row.threshold, row.date]))
);
check(
  "default run rate reproduces the firm handoff balance",
  baseline.points[0].inventory,
  payload.summary.firm_inventory
);
check(
  "PO pipeline ends on the certified pipeline end",
  baseline.pipelinePoints.at(-1).date,
  payload.summary.pipeline_end_date
);
check(
  "projected demand starts where the PO pipeline ends",
  JSON.stringify(baseline.demandPoints[0]),
  JSON.stringify(baseline.pipelinePoints.at(-1))
);
check(
  "PO pipeline is a separate blue dash-dot series",
  source.includes('label: "Order in Pipeline"') && source.includes("borderDash: [10, 4, 2, 4]"),
  true
);
check(
  "red projected demand is a solid tail",
  source.includes('label: `Projected Demand') && source.includes("borderDash: []"),
  true
);

const faster = api.projectSeries(payload, 10);
const slower = api.projectSeries(payload, 1);
check("a faster run rate depletes sooner", faster.zeroDate < baseline.zeroDate, true);
check("a slower run rate depletes later", slower.zeroDate > baseline.zeroDate, true);

// Pending orders are already committed, so changing the opening speed must not
// move the pipeline phase or invent inventory.
check(
  "pending pipeline burn is unchanged by the run rate",
  faster.points[1].inventory,
  baseline.points[1].inventory
);
check("run rate is clamped to the control range", api.clampRunRate(99), 10);
check("run rate snaps to half-shop steps", api.clampRunRate(5.7), 5.5);
check("run rate always reads with one decimal", api.fmtRate(4), "4.0");
check("annualized run rate is calculated dynamically", api.shopsPerYear(5.5), 286);
check("depletion copy uses annualized shops", api.depletionNote(baseline), "Pool depleted Jun 14, 2028 at 286 shops/year");
check("Kimlie stock status is named as a source", source.includes("Kimlie’s bi-weekly stock status"), true);
check("depot card names the 2025 receipts", source.includes("units in 2025"), true);
check("chart labels the three era boundaries", source.includes("axisTickLabel") && source.includes("era.name"), true);
check("depot recommendation is 500 devices", source.includes("500 devices"), true);

// A slow rate can stretch the axis past four years; quarterly ticks would
// overlap, so the step widens with the span.
const twoYears = new Date(2026, 1, 1).getTime();
check("a short span keeps quarterly ticks", api.tickStepMonths(twoYears, new Date(2028, 1, 1).getTime()), 3);
check("a long span widens the tick step", api.tickStepMonths(twoYears, new Date(2030, 6, 1).getTime()), 6);

// Hover shows one line at one date. Index mode on a time axis mixed three
// series at three different dates under a raw millisecond title.
check("hover picks the single nearest point", /interaction:\s*\{\s*mode:\s*"nearest"/.test(source), true);
const hovered = { parsed: { x: new Date(2027, 2, 1).getTime(), y: 3390 }, dataset: { label: "Order in Pipeline" } };
check("tooltip title is a readable date", api.tooltipTitle([hovered]), "Mar 1, 2027");
check("tooltip body is one balance", api.tooltipLabel(hovered), "Order in Pipeline: 3,390 units");

// Balance and pipeline change on discrete dates, so they step rather than
// sliding between events.
check("balance, pipeline, and detail are stepped", (source.match(/stepped: "after"/g) || []).length, 3);
const radii = api.orderStepRadius([
  { inventory: 3760 },
  { inventory: 3740 },
  { inventory: 3740 },
  { inventory: 3730 },
]);
check("each order step gets a marker", JSON.stringify(radii), JSON.stringify([0, 4, 0, 4]));

// A 10-unit order is about 1px tall on the 0–6,000 main axis, so the pipeline
// gets its own zoomed detail with a y-axis fitted to the orders.
check("pipeline detail canvas exists", html.includes('id="chart-devices-pipeline"'), true);
const range = api.pipelineRange([{ inventory: 3760 }, { inventory: 3390 }]);
check("detail axis floor hugs the lowest balance", range.min, 3350);
check("detail axis ceiling hugs the highest balance", range.max, 3800);
check(
  "main chart drops crowded order markers",
  source.includes("pointRadius: orderStepRadius(projection.pipelinePoints)"),
  false
);
check("detail chart marks each order step", source.includes("pointRadius: orderStepRadius(points)"), true);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("Payment devices smoke checks passed");
