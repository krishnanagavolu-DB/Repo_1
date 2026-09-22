/* Executive overview: pure cross-channel calculations for the preview dashboard. */

(function () {
function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactUsd(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000) return `$${(number / 1_000_000).toFixed(1)}M`;
  if (absolute >= 1_000) return `$${(number / 1_000).toFixed(0)}K`;
  return number.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compactCount(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  const absolute = Math.abs(number);
  if (absolute >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `${(number / 1_000).toFixed(0)}K`;
  return Math.round(number).toLocaleString("en-US");
}

/* Matches the ASCII hyphen used by pos-sales.js/olo-pay.js wowLabel(), not the
   Unicode minus sign, so overview and channel-tab deltas read consistently. */
function formatSignedPct(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  if (number > 0) return `+${number.toFixed(1)}%`;
  if (number < 0) return `-${Math.abs(number).toFixed(1)}%`;
  return "0.0%";
}

function signedPoints(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  if (number > 0) return `+${number.toFixed(2)} pts`;
  if (number < 0) return `-${Math.abs(number).toFixed(2)} pts`;
  return "0.00 pts";
}

function worldpayWeeks(payload) {
  const weeks = Array.isArray(payload?.periods?.weeks) ? payload.periods.weeks : [];
  return weeks
    .map((week) => ({
      id: week.id,
      label: week.label,
      authRate: finiteNumber(week?.kpis?.auth_rate?.value) === null
        ? null
        : Number(week.kpis.auth_rate.value) * 100,
      authDeltaPp: finiteNumber(week?.kpis?.auth_rate?.delta) === null
        ? null
        : Number(week.kpis.auth_rate.delta) * 100,
      icRate: finiteNumber(week?.kpis?.ic_rate?.value),
      icFee: finiteNumber(week?.kpis?.ic_fee?.value),
      authApprovedCnt: finiteNumber(week?.totals?.auth_approved_cnt),
      authAttemptsCnt: finiteNumber(week?.totals?.auth_total_cnt),
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function intersectPeriodIds(posWeeks, worldpay, oloWeeks) {
  const pos = new Set(posWeeks.map((week) => week.sortKey));
  const wp = new Set(worldpay.map((week) => week.id));
  const olo = new Set(oloWeeks.map((week) => week.sortKey));
  return [...pos].filter((id) => wp.has(id) && olo.has(id)).sort();
}

function selectedAndPrior(weeks, periodId, idKey) {
  const sorted = [...(weeks || [])].sort((a, b) =>
    String(a?.[idKey] || "").localeCompare(String(b?.[idKey] || ""))
  );
  const index = sorted.findIndex((week) => week?.[idKey] === periodId);
  return {
    selected: index >= 0 ? sorted[index] : null,
    prior: index > 0 ? sorted[index - 1] : null,
  };
}

function percentChange(current, prior) {
  const currentNumber = finiteNumber(current);
  const priorNumber = finiteNumber(prior);
  if (currentNumber === null || priorNumber === null || priorNumber === 0) return null;
  return ((currentNumber - priorNumber) / priorNumber) * 100;
}

function pointChange(current, prior) {
  const currentNumber = finiteNumber(current);
  const priorNumber = finiteNumber(prior);
  if (currentNumber === null || priorNumber === null) return null;
  return currentNumber - priorNumber;
}

function delta(value, unit) {
  const number = finiteNumber(value);
  if (number === null) return null;
  const display = unit === "points" ? signedPoints(number) : formatSignedPct(number);
  return {
    value: number,
    unit,
    display,
    text: `${display} vs prior week`,
    tone: number > 0 ? "up" : number < 0 ? "down" : "flat",
  };
}

function kpi(label, value, display, movement, source) {
  return { label, value, display, delta: movement, source };
}

function buildSalesTrend(periodId, posWeeks, oloWeeks) {
  const pos = (posWeeks || []).filter((week) => week.sortKey <= periodId).slice(-12);
  const olo = (oloWeeks || []).filter((week) => week.sortKey <= periodId).slice(-12);
  const labels = [...new Set([...pos, ...olo].map((week) => week.sortKey))].sort().slice(-12);
  const posById = new Map(pos.map((week) => [week.sortKey, week]));
  const oloById = new Map(olo.map((week) => [week.sortKey, week]));

  return {
    labels,
    datasets: [
      {
        label: "In-shop sales",
        source: "POS · ex-tip",
        data: labels.map((id) => {
          const week = posById.get(id);
          return week ? finiteNumber(week.reportedTotal ?? week.tenderTotal) : null;
        }),
      },
      {
        label: "Order-ahead sales",
        source: "Olo Pay · ex-tip",
        data: labels.map((id) => finiteNumber(oloById.get(id)?.sales)),
      },
    ],
  };
}

function buildTenderMix(posWeek) {
  const rows = (posWeek?.tenders || []).map((row) => ({
    label: row.label,
    amount: finiteNumber(row.amount),
    pct: finiteNumber(row.pct),
  }));
  return {
    labels: rows.map((row) => row.label),
    datasets: [{ label: "POS tender mix", data: rows.map((row) => row.pct) }],
    rows,
  };
}

function buildWatchlist(model) {
  const missing = Object.entries(model.coverage || {})
    .filter(([, available]) => !available)
    .map(([source]) => ({ pos: "POS", worldpay: "Worldpay", olo: "Olo Pay" })[source]);
  const notices = missing.length
    ? [{
        tone: "context",
        text: `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not available for this period.`,
        movement: null,
      }]
    : [];

  const observations = Object.values(model.kpis || {})
    .filter((item) => finiteNumber(item?.delta?.value) !== null)
    .map((item) => ({
      tone: item.delta.value > 0 ? "positive" : item.delta.value < 0 ? "watch" : "context",
      text: `${item.label} ${item.delta.text}.`,
      movement: Math.abs(item.delta.value),
    }))
    .sort((a, b) => b.movement - a.movement);

  return [...notices, ...observations.slice(0, 3 - notices.length)];
}

function overviewForPeriod(periodId, sources) {
  const pos = selectedAndPrior(sources?.pos, periodId, "sortKey");
  const worldpay = selectedAndPrior(sources?.worldpay, periodId, "id");
  const olo = selectedAndPrior(sources?.olo, periodId, "sortKey");

  const posSales = finiteNumber(pos.selected?.reportedTotal ?? pos.selected?.tenderTotal);
  const priorPosSales = finiteNumber(pos.prior?.reportedTotal ?? pos.prior?.tenderTotal);
  const posOrders = finiteNumber(pos.selected?.orderCount);
  const posAvgTicket = finiteNumber(pos.selected?.avgTicket);
  const cardAuthRate = finiteNumber(worldpay.selected?.authRate);
  const oloSales = finiteNumber(olo.selected?.sales);
  const oloAuthRate = finiteNumber(olo.selected?.authRatePct);

  const model = {
    periodId,
    label: pos.selected?.label || worldpay.selected?.label || olo.selected?.label || periodId,
    coverage: {
      pos: Boolean(pos.selected),
      worldpay: Boolean(worldpay.selected),
      olo: Boolean(olo.selected),
    },
    kpis: {
      inShopSales: kpi(
        "In-shop sales",
        posSales,
        compactUsd(posSales),
        delta(percentChange(posSales, pos.prior?.reportedTotal ?? pos.prior?.tenderTotal), "percent"),
        "POS · ex-tip"
      ),
      inShopOrders: kpi(
        "In-shop orders",
        posOrders,
        compactCount(posOrders),
        delta(percentChange(posOrders, pos.prior?.orderCount), "percent"),
        "POS · guest checks"
      ),
      inShopAvgTicket: kpi(
        "In-shop avg ticket",
        posAvgTicket,
        posAvgTicket === null ? "—" : `$${posAvgTicket.toFixed(2)}`,
        delta(percentChange(posAvgTicket, pos.prior?.avgTicket), "percent"),
        "POS · ex-tip"
      ),
      cardAuthRate: kpi(
        "Card auth rate",
        cardAuthRate,
        cardAuthRate === null ? "—" : `${cardAuthRate.toFixed(2)}%`,
        delta(pointChange(cardAuthRate, worldpay.prior?.authRate), "points"),
        "Worldpay · card present"
      ),
      orderAheadSales: kpi(
        "Order-ahead sales",
        oloSales,
        compactUsd(oloSales),
        delta(percentChange(oloSales, olo.prior?.sales), "percent"),
        "Olo Pay · ex-tip"
      ),
      orderAheadAuthRate: kpi(
        "Order-ahead auth rate",
        oloAuthRate,
        oloAuthRate === null ? "—" : `${oloAuthRate.toFixed(2)}%`,
        delta(pointChange(oloAuthRate, olo.prior?.authRatePct), "points"),
        "Stripe · order ahead"
      ),
    },
    salesTrend: buildSalesTrend(periodId, sources?.pos, sources?.olo),
    tenderMix: buildTenderMix(pos.selected),
  };
  model.watchlist = buildWatchlist(model);
  return model;
}

function isHistoryPeriod(periodId) {
  return periodId === "history" || periodId === "ytd";
}

/* Volume-weighted card auth rate: sum(approved) / sum(attempts) across the
   given weeks, matching the certified aggregation the Worldpay pipeline
   itself uses for periods.ytd (src/worldpay_dashboard/kpis.py sums
   auth_approved_cnt/auth_total_cnt across weeks, not the mean of weekly
   rates) — restricted here to the overview's common weeks rather than
   Worldpay's own longer history. A simple mean of weekly rates would let a
   low-volume week move the aggregate as much as a high-volume week; this
   does not. */
function weightedAuthRate(weeks) {
  let approvedSum = 0;
  let attemptsSum = 0;
  for (const week of weeks || []) {
    const approved = finiteNumber(week?.authApprovedCnt);
    const attempts = finiteNumber(week?.authAttemptsCnt);
    if (approved === null || attempts === null || attempts <= 0) continue;
    approvedSum += approved;
    attemptsSum += attempts;
  }
  if (attemptsSum <= 0) return null;
  return (approvedSum / attemptsSum) * 100;
}

/* Cross-channel "Available history" aggregate, restricted to the periods
   common to POS, Worldpay, and Olo (never each source's own full history,
   which differ in length). Reuses each channel's own existing aggregateWeeks
   helper for POS and Olo, and never sums POS, Worldpay, or Olo sales
   together. There is no meaningful "prior period" for an aggregate, so KPI
   deltas stay null (rendered as "Comparison unavailable") rather than
   inventing one. */
function overviewForHistory(periodIds, sources) {
  const ids = new Set(periodIds || []);
  const posSubset = (sources?.pos || []).filter((week) => ids.has(week.sortKey));
  const oloSubset = (sources?.olo || []).filter((week) => ids.has(week.sortKey));
  const worldpaySubset = (sources?.worldpay || []).filter((week) => ids.has(week.id));

  const posAgg = window.__posSales?.aggregateWeeks(posSubset) || null;
  const oloAgg = window.__oloPay?.aggregateWeeks(oloSubset) || null;
  const worldpayAuthRate = weightedAuthRate(worldpaySubset);

  const posSales = finiteNumber(posAgg?.reportedTotal ?? posAgg?.tenderTotal);
  const posOrders = finiteNumber(posAgg?.orderCount);
  const posAvgTicket = finiteNumber(posAgg?.avgTicket);
  const oloSales = finiteNumber(oloAgg?.sales);
  const oloAuthRate = finiteNumber(oloAgg?.authRatePct);

  const model = {
    periodId: "history",
    label: "Available history",
    coverage: {
      pos: Boolean(posSubset.length),
      worldpay: Boolean(worldpaySubset.length),
      olo: Boolean(oloSubset.length),
    },
    kpis: {
      inShopSales: kpi("In-shop sales", posSales, compactUsd(posSales), null, "POS · ex-tip"),
      inShopOrders: kpi(
        "In-shop orders",
        posOrders,
        compactCount(posOrders),
        null,
        "POS · guest checks"
      ),
      inShopAvgTicket: kpi(
        "In-shop avg ticket",
        posAvgTicket,
        posAvgTicket === null ? "—" : `$${posAvgTicket.toFixed(2)}`,
        null,
        "POS · ex-tip"
      ),
      cardAuthRate: kpi(
        "Card auth rate",
        worldpayAuthRate,
        worldpayAuthRate === null ? "—" : `${worldpayAuthRate.toFixed(2)}%`,
        null,
        "Worldpay · card present"
      ),
      orderAheadSales: kpi("Order-ahead sales", oloSales, compactUsd(oloSales), null, "Olo Pay · ex-tip"),
      orderAheadAuthRate: kpi(
        "Order-ahead auth rate",
        oloAuthRate,
        oloAuthRate === null ? "—" : `${oloAuthRate.toFixed(2)}%`,
        null,
        "Stripe · order ahead"
      ),
    },
    salesTrend: buildSalesTrend((periodIds || []).at(-1) || "", sources?.pos, sources?.olo),
    tenderMix: buildTenderMix(posAgg),
  };
  model.watchlist = buildWatchlist(model);
  /* An aggregate has no per-week delta and (by construction) no coverage
     gaps, so buildWatchlist() above returns nothing to show. A blank panel
     reads as broken; state one neutral, factual line about the coverage
     itself instead of inventing a trend or cause. */
  if (!model.watchlist.length) {
    const coverage = overviewDataStart(periodIds, sources);
    if (coverage) {
      const endLabel = endOfWeekLabel(periodLabelFor((periodIds || []).at(-1), sources));
      model.watchlist = [
        {
          tone: "context",
          text: `Available history covers ${coverage.weekCount} common certified weeks from ${coverage.startLabel} through ${endLabel}.`,
          movement: null,
        },
      ];
    }
  }
  return model;
}

/* Screenshot-ready overview panel: loads its own three certified feeds,
   intersects their periods, and renders the compact leadership slide. */

const POS_DATA_URL = "data/in_shop_sales_data.json";
const WORLDPAY_DATA_URL = "data/dashboard.json";
const OLO_DATA_URL = "data/olo_pay_data.json";

const SALES_LINE_COLORS = ["#006098", "#154167"];
const TENDER_COLORS = {
  Card: "#006098",
  Cash: "#154167",
  "Gift Card / Dutch Pass": "#F6E300",
};
/* Brand yellow fails WCAG as small text, so ink uses official navy. */
const TENDER_INK = { "Gift Card / Dutch Pass": "#154167" };

let selectedPeriodId = null;
let overviewSalesChart = null;
let overviewTenderChart = null;

function tenderColor(label, idx = 0) {
  return TENDER_COLORS[label] || ["#006098", "#154167", "#F6E300"][idx % 3];
}

function tenderInk(label, idx = 0) {
  return TENDER_INK[label] || tenderColor(label, idx);
}

function sharePct(fraction) {
  const share = finiteNumber(fraction) === null ? 0 : fraction * 100;
  if (share > 0 && share < 0.05) return "<0.1%";
  return `${share.toFixed(1)}%`;
}

/** "Sep 14 – Sep 20, 2026" -> "Sep 14", to fit the sales-trend x-axis. */
function shortLabel(label) {
  return String(label || "").replace(/\s*–.*$/, "");
}

/** "Sep 14 – Sep 20, 2026" -> "Sep 20, 2026", the week's certified end date. */
function endOfWeekLabel(label) {
  const match = String(label || "").match(/–\s*(.+)$/);
  return match ? match[1].trim() : String(label || "");
}

function periodLabelFor(periodId, sources) {
  const pos = (sources?.pos || []).find((week) => week.sortKey === periodId);
  if (pos) return pos.label;
  const worldpay = (sources?.worldpay || []).find((week) => week.id === periodId);
  if (worldpay) return worldpay.label;
  const olo = (sources?.olo || []).find((week) => week.sortKey === periodId);
  return olo ? olo.label : periodId;
}

function deltaHtml(movement) {
  if (!movement) return `<small class="flat">Comparison unavailable</small>`;
  return `<small class="${movement.tone}">${movement.text}</small>`;
}

function renderKpis(model) {
  const grid = document.getElementById("overview-kpis");
  if (!grid) return;
  grid.innerHTML = Object.values(model.kpis)
    .map(
      (item) => `
      <article class="executive-kpi">
        <span class="executive-kpi-source">${item.source}</span>
        <strong>${item.display}</strong>
        <span>${item.label}</span>
        ${deltaHtml(item.delta)}
      </article>`
    )
    .join("");
}

function renderSalesChart(model, sources) {
  const canvas = document.getElementById("chart-overview-sales");
  if (!canvas || typeof Chart === "undefined") return;
  if (overviewSalesChart) overviewSalesChart.destroy();
  const trend = model.salesTrend;
  overviewSalesChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: trend.labels.map((id) => shortLabel(periodLabelFor(id, sources))),
      datasets: trend.datasets.map((dataset, idx) => ({
        label: dataset.label,
        data: dataset.data,
        valueFormatter: (value) => compactUsd(value),
        borderColor: SALES_LINE_COLORS[idx % SALES_LINE_COLORS.length],
        backgroundColor: "transparent",
        borderWidth: 3,
        spanGaps: true,
        pointRadius: 3,
        tension: 0.25,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        inlineValueLabels: { display: true },
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: { boxWidth: 10, font: { size: 10 }, color: "#154167" },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${compactUsd(ctx.raw)}`,
          },
        },
      },
      layout: { padding: { top: 14 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#5a6f82", font: { size: 10 }, maxRotation: 0 },
        },
        y: { display: false, grace: "18%" },
      },
      elements: { point: { hoverRadius: 4 } },
    },
  });
}

/* Legend dots use tenderInk, not the raw chart-slice color: brand yellow
   fails WCAG as small text/iconography, so Gift Card / Dutch Pass reads as
   navy in the legend even though its doughnut slice stays true yellow. */
function renderTenderLegend(rows) {
  const el = document.getElementById("legend-overview-tender");
  if (!el) return;
  el.innerHTML = rows
    .map(
      (row, idx) => `
      <tr>
        <td><span style="color:${tenderInk(row.label, idx)}" aria-hidden="true">●</span> ${row.label}</td>
        <td>${sharePct(row.pct)} <span class="mix-hint">${compactUsd(row.amount)}</span></td>
      </tr>`
    )
    .join("");
}

function renderTenderChart(model) {
  const canvas = document.getElementById("chart-overview-tender");
  if (!canvas || typeof Chart === "undefined") return;
  if (overviewTenderChart) overviewTenderChart.destroy();
  const rows = model.tenderMix.rows;
  const colors = rows.map((row, idx) => tenderColor(row.label, idx));
  renderTenderLegend(rows);
  overviewTenderChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: rows.map((row) => row.label),
      datasets: [
        {
          data: rows.map((row) => row.pct),
          valueFormatter: (value) => (Number(value) >= 0.05 ? sharePct(value) : ""),
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        inlineValueLabels: { display: true },
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const row = rows[ctx.dataIndex];
              if (!row) return "";
              return `${sharePct(row.pct)} · ${compactUsd(row.amount)}`;
            },
          },
        },
      },
    },
  });
}

function renderWatchlist(model) {
  const list = document.getElementById("overview-watchlist");
  if (!list) return;
  list.innerHTML = model.watchlist
    .map((item) => `<li data-tone="${item.tone}">${item.text}</li>`)
    .join("");
}

/** Earliest common week, used to register a meaningful available-history
    banner for the overview tab (the intersection, not any one source's
    own longer history). */
function overviewDataStart(periodIds, sources) {
  if (!periodIds?.length) return null;
  const firstId = periodIds[0];
  const label = shortLabel(periodLabelFor(firstId, sources));
  const year = String(firstId).slice(0, 4);
  return {
    startLabel: year ? `${label}, ${year}` : label,
    weekCount: periodIds.length,
  };
}

function renderOverview(periodId, { force = false } = {}) {
  const state = window.__executiveOverviewState;
  if (!state?.periodIds?.length) return;
  const resolvedId = isHistoryPeriod(periodId)
    ? "history"
    : state.periodIds.includes(periodId)
      ? periodId
      : state.periodIds.at(-1);

  /* registerPeriods() below can synchronously echo a "dashboard:period"
     event back into this same listener before loadOverview()'s own explicit
     call runs; skip the second call for the same resolved period instead of
     re-building both charts twice on every load. `force` bypasses this for
     the dashboard:tab handler below, which needs a real rebuild even when
     the period id hasn't changed. */
  if (!force && resolvedId === selectedPeriodId && overviewSalesChart) return;
  selectedPeriodId = resolvedId;

  const sources = { pos: state.pos, worldpay: state.worldpay, olo: state.olo };
  const model =
    resolvedId === "history"
      ? overviewForHistory(state.periodIds, sources)
      : overviewForPeriod(resolvedId, sources);

  const periodLabel = document.getElementById("overview-period-label");
  if (periodLabel) periodLabel.textContent = model.label;
  renderKpis(model);
  renderSalesChart(model, state);
  renderTenderChart(model);
  renderWatchlist(model);
}

async function loadOverview() {
  try {
    const [posRes, worldpayRes, oloRes] = await Promise.all([
      fetch(POS_DATA_URL, { cache: "no-store" }),
      fetch(WORLDPAY_DATA_URL, { cache: "no-store" }),
      fetch(OLO_DATA_URL, { cache: "no-store" }),
    ]);
    if (!posRes.ok || !worldpayRes.ok || !oloRes.ok) return;
    const [posPayload, worldpayPayload, oloPayload] = await Promise.all([
      posRes.json(),
      worldpayRes.json(),
      oloRes.json(),
    ]);
    const pos = window.__posSales?.normalizePosData(posPayload) || [];
    const olo = window.__oloPay?.normalizeOloData(oloPayload) || [];
    const worldpay = worldpayWeeks(worldpayPayload);
    const periodIds = intersectPeriodIds(pos, worldpay, olo);
    window.__executiveOverviewState = { pos, worldpay, olo, periodIds };
    if (!periodIds.length) return;
    const sources = { pos, worldpay, olo };
    window.__ytdBanner?.register("overview", overviewDataStart(periodIds, sources));
    window.__dashboardTabs?.registerPeriods(
      "overview",
      periodIds.map((id) => ({ id, label: periodLabelFor(id, sources) }))
    );
    /* If registerPeriods() above already rendered via its event echo (the
       common case, since Executive Overview is the default active tab),
       renderOverview()'s own guard makes this a no-op; it only does real
       work when the echo did not fire (e.g. overview is not the active
       tab, or the tab coordinator is unavailable). */
    renderOverview(selectedPeriodId || periodIds.at(-1));
  } catch (err) {
    console.error(err);
  }
}

window.__executiveOverview = {
  worldpayWeeks,
  intersectPeriodIds,
  overviewForPeriod,
  isHistoryPeriod,
  overviewForHistory,
  buildWatchlist,
  formatSignedPct,
  loadOverview,
  renderOverview,
  getSelectedPeriod() {
    return selectedPeriodId;
  },
};

function startOverviewWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    loadOverview();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => loadOverview(), { once: true });
}

window.addEventListener("dashboard:period", (event) => {
  const tabId = event.detail?.tabId;
  if (tabId !== "overview") return;
  const periodId = event.detail?.periodId;
  if (!periodId) return;
  if (!window.__executiveOverviewState?.periodIds?.length) {
    selectedPeriodId = periodId;
    return;
  }
  renderOverview(periodId);
});

/* If a viewer switches away from Executive Overview before loadOverview()
   finishes fetching, loadOverview()'s own render call still fires while the
   panel is hidden, building both charts against a 0×0 canvas. Chrome's
   ResizeObserver-driven Chart.js responsive resize happens to self-correct
   once the panel is unhidden again (confirmed by measuring canvas width/
   height before and after re-activating the tab), but that isn't guaranteed
   across browsers/Chart.js versions, and the period-echo render this module
   already listens for is guarded against re-firing for an unchanged period
   id. Force a fresh render whenever the overview tab is (re)activated and
   data is already loaded, so the charts are deterministically rebuilt
   against the panel's real, visible dimensions rather than depending on
   that self-correction. */
window.addEventListener("dashboard:tab", (event) => {
  if (event.detail?.tabId !== "overview") return;
  const state = window.__executiveOverviewState;
  if (!state?.periodIds?.length) return;
  renderOverview(selectedPeriodId || state.periodIds.at(-1), { force: true });
});

document.addEventListener("DOMContentLoaded", startOverviewWhenUnlocked);
})();
