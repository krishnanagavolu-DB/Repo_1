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

function formatSignedPct(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  if (number > 0) return `+${number.toFixed(1)}%`;
  if (number < 0) return `−${Math.abs(number).toFixed(1)}%`;
  return "0.0%";
}

function signedPoints(value) {
  const number = finiteNumber(value);
  if (number === null) return "—";
  if (number > 0) return `+${number.toFixed(2)} pts`;
  if (number < 0) return `−${Math.abs(number).toFixed(2)} pts`;
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

window.__executiveOverview = {
  worldpayWeeks,
  intersectPeriodIds,
  overviewForPeriod,
  buildWatchlist,
  formatSignedPct,
};
})();
