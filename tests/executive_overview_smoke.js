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
  window: { addEventListener() {}, dispatchEvent() {} },
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
for (const script of [
  "site/preview/js/pos-sales.js",
  "site/preview/js/olo-pay.js",
  "site/preview/js/executive-overview.js",
]) {
  vm.runInContext(fs.readFileSync(script, "utf8"), sandbox);
}

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const posPayload = JSON.parse(
  fs.readFileSync("data/processed/in_shop_sales_data.json", "utf8")
);
const worldpayPayload = JSON.parse(
  fs.readFileSync("data/processed/dashboard.json", "utf8")
);
const oloPayload = JSON.parse(
  fs.readFileSync("data/processed/olo_pay_data.json", "utf8")
);

const posWeeks = sandbox.window.__posSales.normalizePosData(posPayload);
const oloWeeks = sandbox.window.__oloPay.normalizeOloData(oloPayload);
const overview = sandbox.window.__executiveOverview;
const worldpayWeeks = overview.worldpayWeeks(worldpayPayload);

const periodIds = overview.intersectPeriodIds(posWeeks, worldpayWeeks, oloWeeks);
check("period intersection starts when all sources overlap", periodIds[0], "2026-07-20");
const latestPeriodId = periodIds.at(-1);
const latestPosWeek = posWeeks.find((week) => week.sortKey === latestPeriodId);
const latestWorldpayWeek = worldpayWeeks.find((week) => week.id === latestPeriodId);
const latestOloWeek = oloWeeks.find((week) => week.sortKey === latestPeriodId);
check(
  "latest common period is present in every normalized source",
  Boolean(latestPosWeek && latestWorldpayWeek && latestOloWeek),
  true
);
check("period intersection has no duplicates", new Set(periodIds).size, periodIds.length);
check(
  "one usable source contributes all of its periods",
  JSON.stringify(
    typeof overview.periodIdsForAvailableSources === "function"
      ? overview.periodIdsForAvailableSources({ pos: posWeeks, worldpay: [], olo: [] })
      : null
  ),
  JSON.stringify(posWeeks.map((week) => week.sortKey))
);

const model = overview.overviewForPeriod(latestPeriodId, {
  pos: posWeeks,
  worldpay: worldpayWeeks,
  olo: oloWeeks,
});
check(
  "Total sales stays equal to the normalized POS source only",
  model.kpis.totalSales.value,
  latestPosWeek.reportedTotal ?? latestPosWeek.tenderTotal
);
/* The POS extract applies no channel filter, so its SALES_VOLUME is every
   channel. Calling it "in-shop" overstates the in-shop business by the
   order-ahead share and invites adding it to an overlapping Olo figure. */
check(
  "no KPI presents an all-channel POS figure as in-shop",
  Object.values(model.kpis).some((item) => /in[- ]shop/i.test(item.label)),
  false
);
check("overview has five KPI cards", Object.keys(model.kpis).length, 5);
/* Olo sees card captures only, so app orders paid by Dutch Pass or gift card
   never reach Stripe. Showing Olo sales beside a Gold channel total would put
   two different "order ahead" numbers on one slide. */
check(
  "Olo sales does not appear as an overview KPI",
  Object.keys(model.kpis).includes("orderAheadSales"),
  false
);
check(
  "Olo orders does not appear as an overview KPI",
  Object.keys(model.kpis).includes("orderAheadOrders"),
  false
);
check(
  "Olo stays on the overview as payment health only",
  model.kpis.orderAheadAuthRate.source,
  "Stripe · order ahead"
);

// --- Channel split: reconciles to the published total, or renders nothing ---
const channelWeek = {
  sortKey: latestPeriodId,
  channels: [
    { label: "In shop", sales: 37130000, orders: 3506000 },
    { label: "Order ahead", sales: 6970000, orders: 689000 },
    { label: "Other / delivery", sales: 51389.8, orders: 2913 },
  ],
};
const posTotalForSplit = latestPosWeek.reportedTotal ?? latestPosWeek.tenderTotal;
const balanced = {
  ...channelWeek,
  channels: [
    { label: "In shop", sales: posTotalForSplit - 6970000 - 51389.8, orders: 3506000 },
    { label: "Order ahead", sales: 6970000, orders: 689000 },
    { label: "Other / delivery", sales: 51389.8, orders: latestPosWeek.orderCount - 3506000 - 689000 },
  ],
};
const split = overview.buildChannelSplit(latestPosWeek, balanced);
check("channel split is produced when segments reconcile", Boolean(split), true);
check("channel split keeps three segments", split.segments.length, 3);
check(
  "channel segments sum to the published POS sales total",
  Math.round(split.segments.reduce((sum, s) => sum + s.sales, 0) * 100) / 100,
  Math.round(posTotalForSplit * 100) / 100
);
check(
  "channel shares sum to 100 percent",
  Math.round(split.segments.reduce((sum, s) => sum + s.share, 0) * 1e6) / 1e6,
  1
);
check(
  "channel segments carry their own average ticket",
  Math.round(split.segments[1].avgTicket * 100) / 100,
  Math.round((6970000 / 689000) * 100) / 100
);
check(
  "channel colors reuse the slide's existing blue and navy",
  `${split.segments[0].color}|${split.segments[1].color}`,
  "#006098|#154167"
);
check(
  "brand yellow is not reused for a channel segment",
  split.segments.some((s) => String(s.color).toLowerCase() === "#f6e300"),
  false
);
/* A split that disagrees with the headline number is worse than no split. */
const drifted = {
  ...balanced,
  channels: balanced.channels.map((c, i) => (i === 0 ? { ...c, sales: c.sales - 25000 } : c)),
};
check(
  "a split that misses the published total is refused",
  overview.buildChannelSplit(latestPosWeek, drifted),
  null
);
check(
  "no channel data yields no split rather than an estimate",
  overview.buildChannelSplit(latestPosWeek, null),
  null
);
check(
  "channel split is never derived from Olo",
  overview.buildChannelSplit(latestPosWeek, { sortKey: latestPeriodId, channels: [] }),
  null
);
/* Regression: the model must actually receive channel rows from sources.
   renderOverview once built its sources object without them, so a certified
   feed would have rendered the coming-next state forever. */
const withChannels = overview.overviewForPeriod(latestPeriodId, {
  pos: posWeeks,
  worldpay: worldpayWeeks,
  olo: oloWeeks,
  channels: [balanced],
});
check(
  "a certified channel feed reaches the overview model",
  Boolean(withChannels.channelSplit),
  true
);
check(
  "no channel feed leaves the split null",
  overview.overviewForPeriod(latestPeriodId, { pos: posWeeks, worldpay: worldpayWeeks, olo: oloWeeks })
    .channelSplit,
  null
);
check(
  "channel rows are read from the POS payload shape",
  overview.normalizeChannelWeeks({
    weeks: [
      {
        week_start_date: "2026-09-14",
        channels: [{ label: "In shop", sales: 10, orders: 1 }],
      },
    ],
  })[0].channels[0].sales,
  10
);
check(
  "a POS payload without channel rows yields none",
  overview.normalizeChannelWeeks({ weeks: [{ week_start_date: "2026-09-14" }] }).length,
  0
);

/* At ~0.1% a segment is one pixel wide; it keeps a floor so it stays visible,
   while the key reports the true share. */
check(
  "a tiny segment keeps a visible minimum width",
  split.segments[2].renderWidth >= 1.5,
  true
);
check(
  "the tiny segment still reports its true share",
  split.segments[2].share < 0.005,
  true
);
check("sales trend excludes Worldpay dollars", model.salesTrend.datasets.length, 2);
check("watchlist maximum", model.watchlist.length <= 3, true);
check(
  "watchlist claims no cause or target",
  /because|caused by|driven by|target|goal|threshold/i.test(
    model.watchlist.map((x) => x.text).join(" ")
  ),
  false
);

const partial = overview.overviewForPeriod(latestPeriodId, {
  pos: posWeeks,
  worldpay: [],
  olo: oloWeeks,
});
check("missing Worldpay is unavailable", partial.kpis.cardAuthRate.value, null);
check("missing Worldpay renders explicit unavailable copy", partial.kpis.cardAuthRate.display, "Not available");
check(
  "missing Worldpay creates coverage notice",
  partial.watchlist.some((x) => /Worldpay.*not available/i.test(x.text)),
  true
);

const watchlistModel = {
  coverage: { pos: true, worldpay: true, olo: true },
  kpis: {
    totalSales: {
      label: "Total sales",
      delta: { value: -4.7, unit: "percent", text: "-4.7% vs prior week" },
    },
    totalOrders: {
      label: "Total orders",
      delta: { value: 2.2, unit: "percent", text: "+2.2% vs prior week" },
    },
    cardAuthRate: {
      label: "Card auth rate",
      delta: { value: -0.35, unit: "points", text: "-0.35 pts vs prior week" },
    },
    orderAheadSales: {
      label: "Order-ahead sales",
      delta: { value: 1.4, unit: "percent", text: "+1.4% vs prior week" },
    },
    orderAheadAuthRate: {
      label: "Order-ahead auth rate",
      delta: { value: -12, unit: "points", text: "-12.00 pts vs prior week" },
    },
  },
};
const designedWatchlist = overview.buildWatchlist(watchlistModel);
check("watchlist slot 1 is largest comparable movement", designedWatchlist[0]?.text, "Total sales -4.7% vs prior week.");
check("watchlist slot 2 always carries Card auth health", designedWatchlist[1]?.text, "Card auth rate -0.35 pts vs prior week.");
check(
  "watchlist slot 3 reserves Order-ahead auth health without comparing magnitudes",
  designedWatchlist[2]?.text,
  "Order-ahead auth rate -12.00 pts vs prior week."
);

const coverageWatchlist = overview.buildWatchlist({
  ...watchlistModel,
  coverage: { pos: true, worldpay: false, olo: true },
  kpis: {
    ...watchlistModel.kpis,
    cardAuthRate: {
      ...watchlistModel.kpis.cardAuthRate,
      delta: null,
    },
  },
});
check("coverage watchlist stays capped at three", coverageWatchlist.length, 3);
check(
  "next comparable movement fills slot 2 when Card auth is unavailable",
  coverageWatchlist[1]?.text,
  "Total orders +2.2% vs prior week."
);
check(
  "source coverage remains in slot 3 when Card auth is unavailable",
  /Worldpay.*not available/i.test(coverageWatchlist[2]?.text || ""),
  true
);

const coverageOverrideWatchlist = overview.buildWatchlist({
  ...watchlistModel,
  coverage: { pos: false, worldpay: true, olo: true },
  kpis: {
    ...watchlistModel.kpis,
    totalSales: { ...watchlistModel.kpis.totalSales, delta: null },
    totalOrders: { ...watchlistModel.kpis.totalOrders, delta: null },
  },
});
check(
  "coverage override keeps Card auth in slot 2",
  coverageOverrideWatchlist[1]?.text,
  "Card auth rate -0.35 pts vs prior week."
);
check(
  "coverage override replaces Order-ahead auth in slot 3",
  /POS.*not available/i.test(coverageOverrideWatchlist[2]?.text || ""),
  true
);
check("coverage override remains capped at three", coverageOverrideWatchlist.length, 3);

const gappedWeeks = [
  {
    sortKey: "2099-01-01",
    label: "Jan 1 – Jan 7, 2099",
    reportedTotal: 100,
    orderCount: 10,
    avgTicket: 10,
    tenders: [{ label: "Card", amount: 100, pct: 1 }],
  },
  {
    sortKey: "2099-01-15",
    label: "Jan 15 – Jan 21, 2099",
    reportedTotal: 120,
    orderCount: 12,
    avgTicket: 10,
    tenders: [{ label: "Card", amount: 120, pct: 1 }],
  },
];
const gappedModel = overview.overviewForPeriod("2099-01-15", {
  pos: gappedWeeks,
  worldpay: [],
  olo: [],
});
check("a fourteen-day source gap has no prior-week comparison", gappedModel.kpis.totalSales.delta, null);

const adjacentModel = overview.overviewForPeriod("2099-01-08", {
  pos: [
    gappedWeeks[0],
    { ...gappedWeeks[1], sortKey: "2099-01-08", label: "Jan 8 – Jan 14, 2099" },
  ],
  worldpay: [],
  olo: [],
});
check("a seven-day adjacent source week has a prior-week comparison", Boolean(adjacentModel.kpis.totalSales.delta), true);

const oneWeekId = "2099-02-01";
const oneWeekModel = overview.overviewForPeriod(oneWeekId, {
  pos: [
    {
      sortKey: oneWeekId,
      label: "Feb 1 – Feb 7, 2099",
      reportedTotal: 100,
      orderCount: 10,
      avgTicket: 10,
      tenders: [{ label: "Card", amount: 100, pct: 1 }],
    },
  ],
  worldpay: [
    {
      id: oneWeekId,
      label: "Feb 1 – Feb 7, 2099",
      authRate: 98,
      authApprovedCnt: 98,
      authAttemptsCnt: 100,
    },
  ],
  olo: [
    {
      sortKey: oneWeekId,
      label: "Feb 1 – Feb 7, 2099",
      sales: 25,
      authRatePct: 97,
    },
  ],
});
check("a one-week model never leaves the watchlist blank", oneWeekModel.watchlist.length, 1);
check("one-week comparison notice is neutral", oneWeekModel.watchlist[0]?.tone, "context");
check(
  "one-week comparison notice says comparison is unavailable",
  /comparison is unavailable/i.test(oneWeekModel.watchlist[0]?.text || ""),
  true
);

const html = fs.readFileSync("site/preview/index.html", "utf8");
check(
  "overview tab is first and active",
  /class="tab active"[^>]*data-tab="overview"/.test(html),
  true
);
check("overview panel exists", html.includes('data-panel="overview"'), true);
check("KPI grid exists", html.includes('id="overview-kpis"'), true);
check("channel band exists", html.includes('id="overview-channel-band"'), true);
check(
  "channel band is announced politely",
  /id="overview-channel-band"[^>]*aria-live="polite"/.test(html),
  true
);
check(
  "tender panel no longer calls an all-channel figure in-shop",
  /How guests paid in shop/i.test(html),
  false
);
check(
  "reconciliation note says the total covers every channel",
  /every channel|all channels/i.test(html),
  true
);
check("sales chart exists", html.includes('id="chart-overview-sales"'), true);
check("tender chart exists", html.includes('id="chart-overview-tender"'), true);
check("watchlist exists", html.includes('id="overview-watchlist"'), true);
check("overview has a structured empty-state container", html.includes('id="overview-empty"'), true);
check("overview has a hideable content container", html.includes('id="overview-content"'), true);
check("reconciliation note names overlap", /Worldpay[^<]*overlap/i.test(html), true);
check(
  "overview sales canvas has a grounded image label",
  /<canvas id="chart-overview-sales" role="img" aria-label="[^"]*Total sales[^"]*Order-ahead card sales[^"]*"><\/canvas>/.test(html),
  true
);
/* The POS line is every channel and the Olo line is card captures only, so
   neither may be labelled as the in-shop channel. */
check(
  "sales trend series are not labelled in-shop",
  model.salesTrend.datasets.some((set) => /in[- ]shop/i.test(set.label)),
  false
);
check(
  "sales trend names the Olo series as card sales",
  model.salesTrend.datasets[1].label,
  "Order-ahead card sales"
);
check(
  "overview tender canvas has a grounded image label",
  /<canvas id="chart-overview-tender" role="img" aria-label="[^"]*Card[^"]*Cash[^"]*Gift Card[^"]*"><\/canvas>/.test(html),
  true
);
check(
  "KPI and watchlist updates are announced politely",
  /id="overview-kpis"[^>]*aria-live="polite"/.test(html) &&
    /id="overview-watchlist"[^>]*aria-live="polite"/.test(html),
  true
);

const overviewRef = html.indexOf('src="js/executive-overview.js');
const posRef = html.indexOf('src="js/pos-sales.js');
const oloRef = html.indexOf('src="js/olo-pay.js');
check(
  "overview script loads after POS and Olo helpers",
  overviewRef > posRef && overviewRef > oloRef,
  true
);

// --- Review fix: signed percentage must use the ASCII hyphen, matching
// pos-sales.js/olo-pay.js wowLabel(), not the Unicode minus sign. ---
check("negative percent uses ASCII hyphen", overview.formatSignedPct(-4.7), "-4.7%");
check(
  "negative percent contains no Unicode minus sign",
  overview.formatSignedPct(-4.7).includes("\u2212"),
  false
);

// --- Review fix: tender doughnut canvas must be wrapped in a fixed-size
// chart-wrap container (house pattern), with no forced !important sizing
// directly on the canvas (that fights Chart.js's own responsive resize and
// distorts the circle). ---
check(
  "tender chart canvas is wrapped in a fixed-size chart-wrap container",
  /<div class="chart-wrap"><canvas id="chart-overview-tender"[^>]*><\/canvas><\/div>/.test(html),
  true
);

const css = fs.readFileSync("site/preview/css/dashboard.css", "utf8");
function contrastAgainstWhite(hex) {
  const channels = String(hex || "")
    .replace("#", "")
    .match(/.{2}/g)
    ?.map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
  if (!channels || channels.length !== 3) return 0;
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return 1.05 / (luminance + 0.05);
}
const askDataRef = html.indexOf('<section class="ask-data"');
const lastTabPanelRef = html.lastIndexOf('class="tab-panel"');
check(
  "shared Ask Data is structurally placed after every tab panel",
  askDataRef > lastTabPanelRef && lastTabPanelRef >= 0,
  true
);
check(
  "KPI source labels use at least 10px muted text",
  /\.executive-kpi-source\s*\{[^}]*font-size:\s*10px[^}]*color:\s*var\(--muted\)/s.test(css),
  true
);
check(
  "KPI source labels reserve two-line alignment space",
  /\.executive-kpi-source\s*\{[^}]*min-height:\s*2\.[0-9]+em/s.test(css),
  true
);
check(
  "negative watch movement uses Dutch yellow",
  /\.executive-watchlist li\[data-tone="watch"\]\s*\{[^}]*border-left-color:\s*var\(--yellow\)/s.test(css),
  true
);
check(
  "context notices use Dutch blue",
  /\.executive-watchlist li\[data-tone="context"\]\s*\{[^}]*border-left-color:\s*var\(--blue\)/s.test(css),
  true
);
check(
  "flat comparison text uses the passing muted token",
  /\.executive-kpi small\.flat\s*\{[^}]*color:\s*var\(--muted\)/s.test(css),
  true
);
const goodHex = css.match(/--good:\s*(#[0-9a-f]{6})/i)?.[1];
check(
  "small positive text color reaches WCAG AA contrast on white",
  contrastAgainstWhite(goodHex) >= 4.5,
  true
);
check("tender canvas has no forced !important width", css.includes("width: 130px !important"), false);
check("tender canvas has no forced !important height", css.includes("height: 130px !important"), false);
check(
  "mix panel chart-wrap carries the fixed square size instead",
  /\.executive-mix-panel\s+\.chart-wrap\s*\{[^}]*width:\s*130px/.test(css),
  true
);
// A fixed width/height alone is not enough: the shared `.panel-body
// .chart-wrap { flex: 1 }` rule (used elsewhere for a chart that fills a
// column-flow panel) has equal specificity and wins the cross-axis size via
// flex-basis unless explicitly neutralized here, silently ignoring the
// width/height above. `flex-direction: row` on the panel body is what makes
// height (not width) the cross axis in the first place.
check(
  "mix panel chart-wrap neutralizes the inherited flex:1 (flex-basis wins height otherwise)",
  /\.executive-mix-panel\s+\.chart-wrap\s*\{[^}]*flex:\s*none/.test(css),
  true
);
check(
  "mix panel body is an explicit flex row so height is the cross axis",
  /\.executive-mix-panel\s+\.panel-body\s*\{[^}]*flex-direction:\s*row/.test(css),
  true
);
check(
  "bare Gift Card legend ink falls back to navy",
  typeof overview.tenderInk === "function" ? overview.tenderInk("Gift Card") : null,
  "#154167"
);

// --- Review fix: Executive Overview must support a cross-channel
// "Available history" aggregate — not a silent latest-week fallback.
// Expected sums/rates are derived from the same normalized common weeks
// used by the module under test (via each channel's own already-tested
// aggregateWeeks() helper), not hardcoded literals, so this test does not
// drift when the underlying fixture data changes. ---
const posCommonWeeks = posWeeks.filter((week) => periodIds.includes(week.sortKey));
const oloCommonWeeks = oloWeeks.filter((week) => periodIds.includes(week.sortKey));
const worldpayCommonWeeks = worldpayWeeks.filter((week) => periodIds.includes(week.id));
const expectedPosAgg = sandbox.window.__posSales.aggregateWeeks(posCommonWeeks);
const expectedOloAgg = sandbox.window.__oloPay.aggregateWeeks(oloCommonWeeks);
const expectedApprovedSum = worldpayCommonWeeks.reduce(
  (sum, week) => sum + (week.authApprovedCnt || 0),
  0
);
const expectedAttemptsSum = worldpayCommonWeeks.reduce(
  (sum, week) => sum + (week.authAttemptsCnt || 0),
  0
);
const expectedWeightedAuthRate = (expectedApprovedSum / expectedAttemptsSum) * 100;

const historyModel = overview.overviewForHistory(periodIds, {
  pos: posWeeks,
  worldpay: worldpayWeeks,
  olo: oloWeeks,
});
check("history model labels itself Available history", historyModel.label, "Available history");
check(
  "history Total sales matches POS aggregateWeeks over the common weeks",
  historyModel.kpis.totalSales.value,
  expectedPosAgg.reportedTotal ?? expectedPosAgg.tenderTotal
);
check(
  "history Card auth rate matches sum(approved)/sum(attempts) over the common weeks",
  historyModel.kpis.cardAuthRate.value,
  expectedWeightedAuthRate
);
check(
  "history Total sales is not the latest-week fallback value",
  historyModel.kpis.totalSales.value !== model.kpis.totalSales.value,
  true
);
check("history Total sales keeps the POS-only source label", historyModel.kpis.totalSales.source, "POS · ex-tip");
check(
  "history never presents the all-channel POS total as in-shop",
  Object.values(historyModel.kpis).some((item) => /in[- ]shop/i.test(item.label)),
  false
);

// --- Review fix: card auth rate must be volume-weighted (sum(approved) /
// sum(attempts)), not a simple mean of weekly rates. A synthetic two-week
// case with deliberately lopsided volumes proves this: a simple mean of the
// two rates would land near the middle, but the true weighted rate is
// dominated by the high-volume week. ---
const lopsidedWeeks = [
  { id: "2099-01-01", authRate: 90, authApprovedCnt: 90, authAttemptsCnt: 100 },
  { id: "2099-01-08", authRate: 1, authApprovedCnt: 10, authAttemptsCnt: 1000 },
];
const naiveMean = (lopsidedWeeks[0].authRate + lopsidedWeeks[1].authRate) / 2;
const trueWeighted =
  ((lopsidedWeeks[0].authApprovedCnt + lopsidedWeeks[1].authApprovedCnt) /
    (lopsidedWeeks[0].authAttemptsCnt + lopsidedWeeks[1].authAttemptsCnt)) *
  100;
const lopsidedHistoryModel = overview.overviewForHistory(["2099-01-01", "2099-01-08"], {
  pos: [],
  worldpay: lopsidedWeeks,
  olo: [],
});
check(
  "weighted auth rate differs meaningfully from the naive mean (volume actually matters)",
  Math.abs(naiveMean - trueWeighted) > 5,
  true
);
check(
  "history card auth rate uses the volume-weighted formula, not a simple mean",
  Math.round(lopsidedHistoryModel.kpis.cardAuthRate.value * 1e6) / 1e6,
  Math.round(trueWeighted * 1e6) / 1e6
);
check(
  "history card auth rate is not the naive mean of weekly rates",
  Math.abs(lopsidedHistoryModel.kpis.cardAuthRate.value - naiveMean) > 5,
  true
);

// --- Review fix: an empty history watchlist (no coverage gaps, no
// meaningful per-week delta) must show one neutral factual coverage
// statement, not stay blank and not claim any trend or cause. ---
check("history watchlist is never empty", historyModel.watchlist.length > 0, true);
check(
  "history watchlist states coverage as a neutral fact, not a trend/cause",
  /because|caused by|driven by|trend|declin|increas|grew|grow/i.test(
    historyModel.watchlist.map((item) => item.text).join(" ")
  ),
  false
);
check(
  "history watchlist coverage fact names the common-week count and date range",
  new RegExp(`${periodIds.length}\\s+common certified weeks`).test(
    historyModel.watchlist.map((item) => item.text).join(" ")
  ),
  true
);

// Loading regressions run even when a pure-model assertion above fails so
// RED output proves HTTP failures and activation sequences are exercised.
runRenderingRegressionChecks()
  .then((renderingFailures) => {
    const allFailures = [...failures, ...renderingFailures];
    if (allFailures.length) {
      console.error(JSON.stringify(allFailures, null, 2));
      process.exit(1);
    }
    console.log("Executive overview smoke checks passed");
    console.log("Executive overview rendering smoke checks passed");
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

function makeElementStub() {
  const stub = { textContent: "", hidden: false };
  let html = "";
  Object.defineProperty(stub, "innerHTML", {
    get() {
      return html;
    },
    set(value) {
      html = value;
    },
  });
  return stub;
}

function makeClassList(active = false) {
  const values = new Set(active ? ["active"] : []);
  return {
    contains(value) {
      return values.has(value);
    },
    add(value) {
      values.add(value);
    },
    remove(value) {
      values.delete(value);
    },
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
  };
}

function payloadForUrl(url) {
  if (url.includes("in_shop_sales_data")) return posPayload;
  if (url.includes("dashboard.json")) return worldpayPayload;
  return oloPayload;
}

function successfulFetch(url) {
  return Promise.resolve({ ok: true, status: 200, json: async () => payloadForUrl(url) });
}

function buildRenderingHarness(fetchImpl = successfulFetch) {
  const stats = { salesCharts: 0, tenderCharts: 0 };
  const noticeCalls = [];

  class FakeChart {
    constructor(_canvas, config) {
      if (config?.type === "line") stats.salesCharts += 1;
      if (config?.type === "doughnut") stats.tenderCharts += 1;
    }
    destroy() {}
  }

  const elements = {
    "overview-kpis": makeElementStub(),
    "overview-channel-band": { ...makeElementStub(), classList: makeClassList() },
    "overview-watchlist": makeElementStub(),
    "legend-overview-tender": makeElementStub(),
    "overview-period-label": makeElementStub(),
    "chart-overview-sales": {},
    "chart-overview-tender": {},
    "overview-empty": { ...makeElementStub(), hidden: true },
    "overview-content": { ...makeElementStub(), hidden: false },
  };

  const periodSelect = {
    value: "",
    options: [],
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    replaceChildren(...opts) {
      this.options = opts;
      this.value = "";
    },
  };

  const tabs = [
    {
      dataset: { tab: "overview" },
      classList: makeClassList(true),
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
    },
    {
      dataset: { tab: "pos" },
      classList: makeClassList(false),
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
    },
  ];
  const panels = [
    { dataset: { panel: "overview" }, hidden: false },
    { dataset: { panel: "pos" }, hidden: true },
  ];
  const eventListeners = {};
  const documentEventListeners = {};
  const dispatchedEvents = [];

  const renderSandbox = {
    console,
    Intl,
    Math,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Date,
    Promise,
    Chart: FakeChart,
    CustomEvent: class {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    window: {
      __dashboardAuth: {
        password: "test-key",
        async loadJson(url) {
          const res = await fetchImpl(url);
          if (!res.ok) {
            const error = new Error(`Failed to load ${url} (${res.status})`);
            error.status = res.status;
            throw error;
          }
          return res.json();
        },
      },
      addEventListener(type, handler) {
        (eventListeners[type] = eventListeners[type] || []).push(handler);
      },
      dispatchEvent(event) {
        dispatchedEvents.push(event);
        for (const handler of eventListeners[event.type] || []) handler(event);
      },
      __notices: {
        renderNotice(target, options) {
          noticeCalls.push(options);
          target.innerHTML = `<h3>${options.title}</h3><p>${options.message || ""}</p>`;
          target.hidden = false;
        },
      },
    },
    document: {
      body: { classList: { contains: () => false } },
      addEventListener(type, handler) {
        (documentEventListeners[type] = documentEventListeners[type] || []).push(handler);
      },
      createElement() {
        return { value: "", textContent: "" };
      },
      getElementById(id) {
        if (id === "period-select") return periodSelect;
        return elements[id] || null;
      },
      querySelectorAll(selector) {
        return selector.includes("tab-panel") ? panels : tabs;
      },
      querySelector(selector) {
        return selector.includes(".active") ? tabs[0] : null;
      },
    },
    fetch: fetchImpl,
  };

  vm.createContext(renderSandbox);
  for (const script of [
    "site/preview/js/pos-sales.js",
    "site/preview/js/olo-pay.js",
    "site/preview/js/executive-overview.js",
    "site/preview/js/tabs.js",
  ]) {
    vm.runInContext(fs.readFileSync(script, "utf8"), renderSandbox);
  }

  return {
    sandbox: renderSandbox,
    elements,
    periodSelect,
    stats,
    noticeCalls,
    dispatchedEvents,
    runDomContentLoaded() {
      for (const handler of documentEventListeners.DOMContentLoaded || []) handler();
    },
    changePeriod(value) {
      periodSelect.value = value;
      periodSelect.listeners.change?.();
    },
    resetCharts() {
      stats.salesCharts = 0;
      stats.tenderCharts = 0;
    },
  };
}

async function runRenderingRegressionChecks() {
  const renderingFailures = [];
  function renderCheck(name, actual, expected) {
    if (actual !== expected) renderingFailures.push({ name, expected, actual });
  }

  const full = buildRenderingHarness();
  full.runDomContentLoaded();
  await full.sandbox.window.__executiveOverview.loadOverview();

  renderCheck("sales chart is constructed exactly once on load", full.stats.salesCharts, 1);
  renderCheck("tender chart is constructed exactly once on load", full.stats.tenderCharts, 1);
  renderCheck(
    "initial render shows the latest common week, not history",
    full.elements["overview-period-label"].textContent !== "Available history",
    true
  );
  renderCheck(
    "initial KPI grid shows the latest-week sales figure",
    full.elements["overview-kpis"].innerHTML.includes(model.kpis.totalSales.display),
    true
  );
  /* The published POS weeks carry channel rows, so the band must render the
     split and its segments must add back to the headline total. */
  const bandHtml = full.elements["overview-channel-band"].innerHTML;
  const publishedChannels = posPayload.weeks.at(-1).channels;
  renderCheck(
    "band renders the certified split rather than a placeholder",
    /coming next/i.test(bandHtml),
    !publishedChannels
  );
  if (publishedChannels) {
    renderCheck(
      "band names every published channel",
      publishedChannels.every((row) => bandHtml.includes(row.label)),
      true
    );
    renderCheck(
      "band shows the headline total it splits",
      bandHtml.includes(model.kpis.totalSales.display),
      true
    );
  }

  /* With no channel rows the band must say so and must not print a share of
     any kind, so an executive never sees an implied split. */
  const noChannels = buildRenderingHarness((url) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () => {
        const payload = payloadForUrl(url);
        if (!url.includes("in_shop_sales_data")) return payload;
        return { ...payload, weeks: payload.weeks.map(({ channels, ...rest }) => rest) };
      },
    })
  );
  noChannels.runDomContentLoaded();
  await noChannels.sandbox.window.__executiveOverview.loadOverview();
  const pendingHtml = noChannels.elements["overview-channel-band"].innerHTML;
  renderCheck("band states the split is coming when no channel feed exists", /coming next/i.test(pendingHtml), true);
  renderCheck("pending band prints no percentage", /\d+(\.\d+)?%/.test(pendingHtml), false);
  renderCheck(
    "legend dot ink uses the WCAG-safe navy for Gift Card / Dutch Pass, not raw brand yellow",
    full.elements["legend-overview-tender"].innerHTML.includes("color:#154167") &&
      !/color:#F6E300[^>]*>●<\/span>\s*Gift Card/i.test(
        full.elements["legend-overview-tender"].innerHTML
      ),
    true
  );

  // Switch to Available history and prove it renders the aggregate, not a
  // silent no-op that keeps showing the latest week.
  full.resetCharts();
  full.sandbox.window.dispatchEvent(
    new full.sandbox.CustomEvent("dashboard:period", {
      detail: { periodId: "history", tabId: "overview" },
    })
  );

  renderCheck(
    "selecting Available history updates the period label",
    full.elements["overview-period-label"].textContent,
    "Available history"
  );
  renderCheck(
    "Available history renders the aggregated POS sales figure",
    full.elements["overview-kpis"].innerHTML.includes(historyModel.kpis.totalSales.display),
    true
  );
  renderCheck(
    "Available history no longer shows the latest single-week POS figure",
    full.elements["overview-kpis"].innerHTML.includes(model.kpis.totalSales.display),
    false
  );
  renderCheck("history selection re-renders the sales chart once", full.stats.salesCharts, 1);
  renderCheck("history selection re-renders the tender chart once", full.stats.tenderCharts, 1);

  // --- Review fix: switching to the overview tab (dashboard:tab) after data
  // has already loaded must rerender/rebuild the charts, even though the
  // selected period id hasn't changed. Without this, a chart built while its
  // panel was hidden (e.g. the user switched away before loadOverview()
  // finished, then switched back) stays sized to a hidden 0x0 canvas — the
  // period-echo double-render guard would otherwise skip this rebuild since
  // the resolved period id is unchanged. ---
  full.resetCharts();
  full.sandbox.window.dispatchEvent(
    new full.sandbox.CustomEvent("dashboard:tab", { detail: { tabId: "overview" } })
  );
  renderCheck(
    "activating the overview tab rebuilds the sales chart even though the period is unchanged",
    full.stats.salesCharts,
    1
  );
  renderCheck(
    "activating the overview tab rebuilds the tender chart even though the period is unchanged",
    full.stats.tenderCharts,
    1
  );
  renderCheck(
    "activating another tab does not rebuild the overview charts",
    (() => {
      full.resetCharts();
      full.sandbox.window.dispatchEvent(
        new full.sandbox.CustomEvent("dashboard:tab", { detail: { tabId: "pos" } })
      );
      return full.stats.salesCharts + full.stats.tenderCharts;
    })(),
    0
  );

  // activate() emits both dashboard:period and dashboard:tab. A changed
  // period must still build one chart pair, not one pair for each event.
  full.periodSelect.value = latestPeriodId;
  full.resetCharts();
  full.sandbox.window.__dashboardTabs.activate("overview");
  renderCheck("overview activate/register builds one sales chart", full.stats.salesCharts, 1);
  renderCheck("overview activate/register builds one tender chart", full.stats.tenderCharts, 1);

  full.changePeriod("history");
  full.resetCharts();
  full.sandbox.window.__dashboardTabs.activate("overview");
  renderCheck(
    "overview activation preserves an explicit history selection",
    full.elements["overview-period-label"].textContent,
    "Available history"
  );
  renderCheck("history activation builds one sales chart", full.stats.salesCharts, 1);
  renderCheck("history activation builds one tender chart", full.stats.tenderCharts, 1);

  const expectedWithoutWorldpay = posWeeks
    .map((week) => week.sortKey)
    .filter((id) => oloWeeks.some((week) => week.sortKey === id));
  const partialHttp = buildRenderingHarness((url) => {
    if (url.includes("dashboard.json")) {
      return Promise.resolve({ ok: false, status: 503, json: async () => ({}) });
    }
    return successfulFetch(url);
  });
  await partialHttp.sandbox.window.__executiveOverview.loadOverview();
  renderCheck(
    "one failed HTTP source still registers common successful-feed periods",
    JSON.stringify(partialHttp.sandbox.window.__executiveOverviewState?.periodIds),
    JSON.stringify(expectedWithoutWorldpay)
  );
  renderCheck(
    "one failed HTTP source renders affected KPI as Not available",
    partialHttp.elements["overview-kpis"].innerHTML.includes("Not available"),
    true
  );
  renderCheck(
    "one failed HTTP source renders the grounded coverage watchlist item",
    /Worldpay.*not available/i.test(partialHttp.elements["overview-watchlist"].innerHTML),
    true
  );
  renderCheck("partial-source rendering keeps overview content visible", partialHttp.elements["overview-content"].hidden, false);
  renderCheck("partial-source rendering builds the sales chart", partialHttp.stats.salesCharts, 1);
  renderCheck("partial-source rendering builds the tender chart", partialHttp.stats.tenderCharts, 1);

  const allFailed = buildRenderingHarness((url) =>
    Promise.resolve({ ok: false, status: 503, json: async () => ({ url }) })
  );
  await allFailed.sandbox.window.__executiveOverview.loadOverview();
  renderCheck("all failed HTTP sources do not build charts", allFailed.stats.salesCharts + allFailed.stats.tenderCharts, 0);
  renderCheck("all failed HTTP sources use the structured notice renderer", allFailed.noticeCalls.length, 1);
  renderCheck("all failed HTTP sources reveal the overview empty state", allFailed.elements["overview-empty"].hidden, false);
  renderCheck("all failed HTTP sources hide the overview content", allFailed.elements["overview-content"].hidden, true);

  const coldLoad = buildRenderingHarness();
  coldLoad.runDomContentLoaded();
  renderCheck(
    "realistic DOMContentLoaded before data leaves the period selector empty",
    coldLoad.periodSelect.value,
    ""
  );
  renderCheck(
    "realistic DOMContentLoaded before data announces no fallback period",
    coldLoad.dispatchedEvents.filter((event) => event.type === "dashboard:period").length,
    0
  );
  await coldLoad.sandbox.window.__executiveOverview.loadOverview();
  renderCheck(
    "true cold load selects the latest common period after registration",
    coldLoad.periodSelect.value,
    latestPeriodId
  );
  renderCheck(
    "true cold load renders the latest common week, not history",
    coldLoad.elements["overview-period-label"].textContent,
    model.label
  );
  renderCheck("cold-load latest period builds one sales chart", coldLoad.stats.salesCharts, 1);
  renderCheck("cold-load latest period builds one tender chart", coldLoad.stats.tenderCharts, 1);

  return renderingFailures;
}
