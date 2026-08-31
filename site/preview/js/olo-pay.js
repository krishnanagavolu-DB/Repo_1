/* Olo Pay tab: reads data/olo_pay_data.json published with the preview site. */

(function () {
const OLO_DATA_URL = "data/olo_pay_data.json";
const BRAND_ORDER = ["Visa", "Mastercard", "Amex", "Discover"];
const BRAND_COLORS = {
  Visa: "#006098",
  Mastercard: "#154167",
  Amex: "#F6E300",
  Discover: "#D9272D",
};
/* Brand yellow fails WCAG as small text, so ink uses official navy. */
const BRAND_INK = {
  Amex: "#154167",
};

let selectedPeriodId = null;
let brandChart = null;
const trendCharts = {};

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function usd(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function compactUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return usd(n);
}

function count(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function compactCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return String(Math.round(abs));
}

function ticket(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

/** Auth rates are stored as percentage points (e.g. 96.78). */
function authPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}%`;
}

/** Share fractions (0–1) → "72.7%". */
function sharePct(value) {
  const share = Number(value) * 100;
  if (!Number.isFinite(share)) return "0.0%";
  if (share > 0 && share < 0.05) return "<0.1%";
  return `${share.toFixed(1)}%`;
}

function wowLabel(pctChange) {
  if (pctChange === null || pctChange === undefined || pctChange === "") return null;
  const n = Number(pctChange);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return { text: `+${abs}% vs prior week`, tone: "up" };
  if (n < 0) return { text: `-${abs}% vs prior week`, tone: "down" };
  return { text: "— 0.0% vs prior week", tone: "flat" };
}

/** Authorization movement is published in percentage points. */
function wowPtsLabel(ppChange) {
  if (ppChange === null || ppChange === undefined || ppChange === "") return null;
  const n = Number(ppChange);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n).toFixed(2);
  if (n > 0) return { text: `+${abs} pts vs prior week`, tone: "up" };
  if (n < 0) return { text: `-${abs} pts vs prior week`, tone: "down" };
  return { text: "— 0.00 pts vs prior week", tone: "flat" };
}

function brandColor(label, idx = 0) {
  return BRAND_COLORS[label] || ["#006098", "#154167", "#F6E300", "#D9272D"][idx % 4];
}

function brandInk(label, idx = 0) {
  return BRAND_INK[label] || brandColor(label, idx);
}

function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!match) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  if (!month) return null;
  return { text: `${month} ${Number(match[3])}`, year: match[1] };
}

function weekLabel(week) {
  const explicit = firstString(week, ["label", "week_label", "period_label"]);
  if (explicit) return explicit;
  const start = firstString(week, ["week_start_date", "week_start", "start_date"]);
  const end = firstString(week, ["week_end_date", "week_end", "end_date"]);
  const startPart = shortDate(start);
  const endPart = shortDate(end);
  if (startPart && endPart) return `${startPart.text} – ${endPart.text}, ${endPart.year}`;
  if (start && end) return `${start} – ${end}`;
  return start || "Most recent week";
}

function weekSortKey(week) {
  return (
    firstString(week, ["week_start_date", "week_start", "start_date"]) ||
    firstString(week, ["week_end_date", "week_end", "end_date"]) ||
    ""
  );
}

function normalizeBrands(raw, brandOrder, sales) {
  let rows = [];
  if (Array.isArray(raw)) {
    rows = raw.map((item) => ({
      label: firstString(item, ["label", "brand", "name", "card_brand"]) || "Unknown",
      amount: firstNumber(item, ["amount", "sales", "SALES_VOLUME", "volume"]),
      pctOfSales: firstNumber(item, [
        "pct_of_digital_sales",
        "pct_of_sales",
        "pct",
        "percent",
        "share",
      ]),
      transactions: firstNumber(item, [
        "TRANSACTION_COUNT",
        "transaction_count",
        "transactions",
        "count",
      ]),
    }));
  } else if (raw && typeof raw === "object") {
    rows = Object.entries(raw).map(([key, item]) => {
      if (item !== null && typeof item === "object") {
        return {
          label: firstString(item, ["label", "brand", "name"]) || key,
          amount: firstNumber(item, ["amount", "sales", "SALES_VOLUME", "volume"]),
          pctOfSales: firstNumber(item, [
            "pct_of_digital_sales",
            "pct_of_sales",
            "pct",
            "percent",
            "share",
          ]),
          transactions: firstNumber(item, [
            "TRANSACTION_COUNT",
            "transaction_count",
            "transactions",
            "count",
          ]),
        };
      }
      return { label: key, amount: Number(item), pctOfSales: null, transactions: null };
    });
  }

  rows = rows.filter((row) => Number.isFinite(row.amount));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const basis = Number.isFinite(sales) && sales > 0 ? sales : total;

  for (const row of rows) {
    if (!Number.isFinite(row.pctOfSales)) {
      row.pctOfSales = basis ? (row.amount / basis) * 100 : 0;
    } else if (row.pctOfSales > 0 && row.pctOfSales <= 1.0000001 && basis) {
      // Accept accidental fractions, but published Olo shares are already 0–100.
      const asFraction = row.pctOfSales;
      const asPercent = row.pctOfSales;
      // Prefer the published 0–100 scale when it matches the dollar share.
      const pctGuess = (row.amount / basis) * 100;
      row.pctOfSales =
        Math.abs(asPercent - pctGuess) <= Math.abs(asFraction * 100 - pctGuess)
          ? asPercent
          : asFraction * 100;
    }
  }

  const order = brandOrder?.length ? brandOrder : BRAND_ORDER;
  rows.sort((a, b) => {
    const ai = order.indexOf(a.label);
    const bi = order.indexOf(b.label);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.amount - a.amount;
  });

  return rows;
}

function normalizeWow(week) {
  const raw = week?.week_over_week || week?.wow || {};
  return {
    salesPct: firstNumber(raw, ["SALES_VOLUME_PCT", "sales_volume_pct", "sales_pct", "sales"]),
    ordersPct: firstNumber(raw, [
      "TRANSACTION_COUNT_PCT",
      "ORDER_COUNT_PCT",
      "transaction_count_pct",
      "orders_pct",
      "orders",
    ]),
    authRatePp: firstNumber(raw, ["AUTH_RATE_PP", "auth_rate_pp", "auth_pp", "auth"]),
  };
}

function normalizeWeek(week, brandOrder) {
  const totals = week?.totals || {};
  const auth = week?.authorization || week?.auth || {};
  const sales = firstNumber(totals, ["SALES_VOLUME", "sales_volume", "sales", "amount"]);
  const transactions = firstNumber(totals, [
    "TRANSACTION_COUNT",
    "transaction_count",
    "transactions",
  ]);
  const orders = firstNumber(totals, ["ORDER_COUNT", "order_count", "orders"]);
  const brands = normalizeBrands(
    week?.card_brand_mix || week?.brands || week?.brand_mix,
    brandOrder,
    sales
  );
  const approved = firstNumber(auth, ["approved", "APPROVED"]);
  const declined = firstNumber(auth, ["declined", "DECLINED"]);
  const failed = firstNumber(auth, ["failed", "FAILED", "failure"]);
  let authRatePct = firstNumber(auth, ["auth_rate_pct", "AUTH_RATE_PCT", "auth_rate"]);
  if (!Number.isFinite(authRatePct)) {
    const attempts =
      (Number.isFinite(approved) ? approved : 0) +
      (Number.isFinite(declined) ? declined : 0) +
      (Number.isFinite(failed) ? failed : 0);
    authRatePct = attempts ? (approved / attempts) * 100 : null;
  } else if (authRatePct > 0 && authRatePct <= 1.0000001) {
    authRatePct = authRatePct * 100;
  }

  const avgTicket =
    firstNumber(totals, ["AVG_TICKET", "avg_ticket", "average_ticket"]) ??
    (sales && orders ? sales / orders : null);

  return {
    label: weekLabel(week),
    sortKey: weekSortKey(week),
    sales,
    transactions,
    orders: Number.isFinite(orders) ? orders : null,
    avgTicket,
    avgTicketBasis:
      firstString(totals, ["AVG_TICKET_BASIS", "avg_ticket_basis", "ticket_basis"]) || null,
    refunds: firstNumber(totals, ["REFUND_VOLUME", "refund_volume", "refunds"]) || 0,
    voids: firstNumber(totals, ["VOID_VOLUME", "void_volume", "voids"]) || 0,
    authRatePct,
    approved,
    declined,
    failed,
    brands,
    wow: normalizeWow(week),
  };
}

/** Accepts the published wrapper object or a bare weeks array. */
function normalizeOloData(raw) {
  let weeks = [];
  if (Array.isArray(raw)) weeks = raw;
  else if (Array.isArray(raw?.weeks)) weeks = raw.weeks;
  else if (raw && typeof raw === "object") weeks = [raw];

  const brandOrder = Array.isArray(raw?.brand_order) ? raw.brand_order : BRAND_ORDER;
  const normalized = weeks
    .map((week) => normalizeWeek(week, brandOrder))
    .filter((week) => Number.isFinite(week.sales));
  normalized.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  return normalized;
}

function aggregateWeeks(weeks) {
  if (!weeks?.length) {
    return {
      label: "YTD",
      sortKey: "ytd",
      weekCount: 0,
      sales: 0,
      transactions: 0,
      orders: 0,
      avgTicket: null,
      avgTicketBasis: null,
      refunds: 0,
      voids: 0,
      authRatePct: null,
      approved: 0,
      declined: 0,
      failed: 0,
      brands: [],
      wow: { salesPct: null, ordersPct: null, authRatePp: null },
    };
  }

  const sales = weeks.reduce((sum, week) => sum + (week.sales || 0), 0);
  const transactions = weeks.reduce((sum, week) => sum + (week.transactions || 0), 0);
  const orders = weeks.reduce((sum, week) => sum + (week.orders || 0), 0);
  const refunds = weeks.reduce((sum, week) => sum + (week.refunds || 0), 0);
  const voids = weeks.reduce((sum, week) => sum + (week.voids || 0), 0);
  const approved = weeks.reduce((sum, week) => sum + (week.approved || 0), 0);
  const declined = weeks.reduce((sum, week) => sum + (week.declined || 0), 0);
  const failed = weeks.reduce((sum, week) => sum + (week.failed || 0), 0);
  const attempts = approved + declined + failed;
  const authRatePct = attempts ? (approved / attempts) * 100 : null;

  const brandMap = new Map();
  for (const week of weeks) {
    for (const brand of week.brands || []) {
      const current = brandMap.get(brand.label) || {
        label: brand.label,
        amount: 0,
        transactions: 0,
      };
      current.amount += brand.amount || 0;
      current.transactions += brand.transactions || 0;
      brandMap.set(brand.label, current);
    }
  }
  const brands = [...brandMap.values()].map((row) => ({
    ...row,
    pctOfSales: sales ? (row.amount / sales) * 100 : 0,
  }));
  brands.sort((a, b) => {
    const ai = BRAND_ORDER.indexOf(a.label);
    const bi = BRAND_ORDER.indexOf(b.label);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.amount - a.amount;
  });

  const first = weeks[0].label.replace(/\s*–.*$/, "");
  const last = weeks[weeks.length - 1].label.replace(/^.*–\s*/, "");
  const bases = new Set(weeks.map((week) => week.avgTicketBasis).filter(Boolean));
  const singleBasis = bases.size === 1 ? [...bases][0] : null;

  return {
    label: `YTD · ${first} – ${last}`,
    sortKey: "ytd",
    weekCount: weeks.length,
    sales,
    transactions,
    orders,
    avgTicket: orders ? sales / orders : null,
    avgTicketBasis: singleBasis,
    refunds,
    voids,
    authRatePct,
    approved,
    declined,
    failed,
    brands,
    wow: { salesPct: null, ordersPct: null, authRatePp: null },
  };
}

const TREND_METRICS = {
  sales: (week) => week.sales,
  auth: (week) => week.authRatePct,
};

function trendSeries(weeks, metric) {
  const pick = TREND_METRICS[metric];
  if (!pick || !weeks?.length) return [];
  const points = weeks
    .map((week) => ({ label: week.label, value: Number(pick(week)) }))
    .filter((point) => Number.isFinite(point.value));
  return points.length > 1 ? points : [];
}

function getDataStart(weeks) {
  if (!weeks?.length) return null;
  return {
    startLabel: `${weeks[0].label.replace(/\s*–.*$/, "")}, ${weeks[0].sortKey.slice(0, 4)}`,
    weekCount: weeks.length,
  };
}

function findWeekForPeriod(weeks, periodId) {
  if (!periodId || periodId === "ytd") return null;
  return weeks.find((week) => week.sortKey === periodId) || null;
}

function deltaHtml(wow) {
  if (!wow) return "";
  return `<div class="kpi-delta ${wow.tone}">${wow.text}</div>`;
}

function renderSummary(week) {
  const grid = document.getElementById("olo-summary-grid");
  if (!grid) return;
  const cards = [
    {
      label: "Digital sales",
      value: compactUsd(week.sales),
      detail: usd(week.sales),
      delta: wowLabel(week.wow?.salesPct),
    },
    {
      label: "Auth rate",
      value: authPct(week.authRatePct),
      detail: null,
      delta: wowPtsLabel(week.wow?.authRatePp),
    },
    {
      label: "Approved orders",
      value: week.orders != null ? compactCount(week.orders) : "—",
      detail: week.orders != null ? count(week.orders) : null,
      delta: wowLabel(week.wow?.ordersPct),
    },
    {
      label: "Avg ticket",
      value: ticket(week.avgTicket),
      detail: null,
      delta: null,
    },
  ];
  grid.innerHTML = cards
    .map(
      (card) => `
      <div class="pos-slide-stat">
        <div class="hero-value">${card.value}</div>
        ${deltaHtml(card.delta)}
        <div class="hero-label">${card.label}</div>
        ${card.detail ? `<div class="hero-sub">${card.detail}</div>` : ""}
      </div>`
    )
    .join("");
}

function renderSupport(week) {
  const el = document.getElementById("olo-support");
  if (!el) return;
  el.innerHTML = `
    <div class="olo-support-row">
      <span class="olo-support-label">Refunds</span>
      <span class="olo-support-value">${usd(week.refunds)}</span>
    </div>
    <div class="olo-support-row">
      <span class="olo-support-label">Voids</span>
      <span class="olo-support-value">${usd(week.voids)}</span>
    </div>
    <p class="panel-note">Approved captures match approved orders on Olo. Wallet mix and decline reasons are not in Phase 1.</p>
  `;
}

function renderTrend(metric, series, activeWeek) {
  const canvas = document.getElementById(`chart-olo-${metric}-trend`);
  if (trendCharts[metric]) {
    trendCharts[metric].destroy();
    trendCharts[metric] = null;
  }
  if (!canvas || typeof Chart === "undefined" || !series.length) return;

  const values = series.map((point) => point.value);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : last;
  const endColor = last < prev ? "#D9272D" : "#006098";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const currentIndex = series.findIndex((point) => point.label === activeWeek?.label);
  const format = (value) => (metric === "sales" ? usd(value) : authPct(value));
  const compact = (value) => (metric === "sales" ? compactUsd(value) : authPct(value));

  trendCharts[metric] = new Chart(canvas, {
    type: "line",
    data: {
      labels: series.map((point) => point.label),
      datasets: [
        {
          label: metric === "sales" ? "Weekly sales" : "Weekly auth rate",
          data: values,
          valueFormatter: (value) => compact(value),
          borderColor: "#006098",
          backgroundColor: "transparent",
          borderWidth: 3,
          pointRadius: series.map((_, idx) => (idx === currentIndex ? 5 : 3)),
          pointBackgroundColor: series.map((_, idx) =>
            idx === values.length - 1 ? endColor : "#006098"
          ),
          tension: 0.25,
        },
        {
          label: `Average · ${format(average)}`,
          data: values.map(() => average),
          inlineLabels: false,
          borderColor: "#c3d0dd",
          borderWidth: 1,
          borderDash: [3, 3],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
          tension: 0,
        },
      ],
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
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: (ctx) => format(ctx.raw),
          },
        },
      },
      layout: { padding: { top: 14 } },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: "#5a6f82", font: { size: 10 }, maxRotation: 0 },
        },
        y: {
          display: false,
          grace: "18%",
        },
      },
      elements: { point: { hoverRadius: 4 } },
    },
  });
}

function renderLegend(el, rows) {
  if (!el) return;
  el.innerHTML = rows
    .map(
      (row, idx) => `
      <tr>
        <td><span style="color:${brandInk(row.label, idx)}" aria-hidden="true">●</span> ${row.label}</td>
        <td>${sharePct(row.pctOfSales / 100)} <span class="mix-hint">${compactUsd(row.amount)}</span></td>
      </tr>`
    )
    .join("");
}

function renderBrandChart(week) {
  const canvas = document.getElementById("chart-olo-brand");
  const legend = document.getElementById("legend-olo-brand");
  if (!canvas || typeof Chart === "undefined") return;
  if (brandChart) brandChart.destroy();
  const colors = week.brands.map((brand, idx) => brandColor(brand.label, idx));
  renderLegend(legend, week.brands);
  brandChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: week.brands.map((brand) => brand.label),
      datasets: [
        {
          data: week.brands.map((brand) => brand.pctOfSales / 100),
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
              const brand = week.brands[ctx.dataIndex];
              if (!brand) return "";
              return `${sharePct(brand.pctOfSales / 100)} · ${compactUsd(brand.amount)}`;
            },
          },
        },
      },
    },
  });
}

function renderDetail(week) {
  const el = document.getElementById("olo-detail");
  if (!el) return;
  const brandRows = week.brands
    .map(
      (brand, idx) => `
      <tr>
        <td><span style="color:${brandInk(brand.label, idx)}" aria-hidden="true">●</span> ${brand.label}</td>
        <td>${usd(brand.amount)}</td>
        <td>${sharePct(brand.pctOfSales / 100)}</td>
        <td>${count(brand.transactions)}</td>
      </tr>`
    )
    .join("");
  el.innerHTML = `
    <table class="mix-legend olo-detail-table" aria-label="Olo Pay brand and approval detail">
      <thead>
        <tr>
          <th scope="col">Card brand</th>
          <th scope="col">Sales</th>
          <th scope="col">Share</th>
          <th scope="col">Approved orders</th>
        </tr>
      </thead>
      <tbody>${brandRows}</tbody>
    </table>
    <table class="mix-legend olo-detail-table" aria-label="Olo Pay supporting totals">
      <tbody>
        <tr><th scope="row">Digital sales</th><td colspan="3">${usd(week.sales)}</td></tr>
        <tr><th scope="row">Auth rate</th><td colspan="3">${authPct(week.authRatePct)}</td></tr>
        <tr><th scope="row">Approved</th><td colspan="3">${count(week.approved)}</td></tr>
        <tr><th scope="row">Declined</th><td colspan="3">${count(week.declined)}</td></tr>
        <tr><th scope="row">Failed</th><td colspan="3">${count(week.failed)}</td></tr>
        <tr><th scope="row">Avg ticket</th><td colspan="3">${ticket(week.avgTicket)}</td></tr>
        <tr><th scope="row">Refunds</th><td colspan="3">${usd(week.refunds)}</td></tr>
        <tr><th scope="row">Voids</th><td colspan="3">${usd(week.voids)}</td></tr>
      </tbody>
    </table>
  `;
}

const IMPORT_STEPS = [
  "Export each Monday–Sunday company-owned week to <code>data/raw/olo-pay/olo_pay_data_YYYYMMDD.json</code>.",
  "Run <code>python3 scripts/import_olo_pay.py data/raw/olo-pay/olo_pay_data_*.json --methodology data/raw/olo-pay/olo_pay_methodology.json --out data/processed/olo_pay_data.json --report data/processed/olo_pay_validation_report.json --preview-copy site/preview/data/olo_pay_data.json</code>.",
  "Commit the updated preview data file and redeploy.",
];

function showNotice(options) {
  const empty = document.getElementById("olo-empty");
  const content = document.getElementById("olo-content");
  if (!empty || !content) return;
  content.hidden = true;
  empty.hidden = false;
  if (window.__notices) {
    window.__notices.renderNotice(empty, options);
  } else {
    empty.innerHTML = `<h3>${options.title}</h3>`;
  }
}

function showReady() {
  const empty = document.getElementById("olo-empty");
  const content = document.getElementById("olo-content");
  if (!empty || !content) return;
  empty.hidden = true;
  content.hidden = false;
}

function renderWeek(week) {
  const periodEl = document.getElementById("olo-period-label");
  if (periodEl) periodEl.textContent = week.label;
  const weeks = window.__oloPayState?.weeks || [];
  renderSummary(week);
  renderSupport(week);
  renderTrend("sales", trendSeries(weeks, "sales"), week);
  renderTrend("auth", trendSeries(weeks, "auth"), week);
  renderBrandChart(week);
  renderDetail(week);
  showReady();
}

function selectPeriod(periodId) {
  const weeks = window.__oloPayState?.weeks || [];
  if (!weeks.length) return;
  selectedPeriodId = periodId;

  if (periodId === "ytd") {
    renderWeek(aggregateWeeks(weeks));
    return;
  }

  const match = findWeekForPeriod(weeks, periodId);
  if (!match) {
    const available = weeks.map((week) => week.label).join(", ");
    showNotice({
      title: "Olo Pay isn't published for this week yet",
      message: `Pick another week — digital approval metrics are available for ${available}.`,
      technical: `No Olo week matches period id "${periodId}" in ${OLO_DATA_URL}.`,
      fix: IMPORT_STEPS,
    });
    return;
  }
  renderWeek(match);
}

function renderOlo(weeks) {
  if (!weeks.length) {
    window.__oloPayState = { weeks: [], latest: null };
    showNotice({
      title: "Olo Pay for this preview isn't published yet",
      message: "Once the certified weekly Olo files are loaded, digital approval metrics will appear here.",
      technical: `No usable weeks found in ${OLO_DATA_URL}.`,
      fix: IMPORT_STEPS,
    });
    return;
  }
  const latest = weeks[weeks.length - 1];
  window.__oloPayState = { weeks, latest };
  window.__ytdBanner?.register("olo", getDataStart(weeks));
  const requested = findWeekForPeriod(weeks, selectedPeriodId);
  if (selectedPeriodId && selectedPeriodId !== "ytd" && !requested) {
    selectPeriod(selectedPeriodId);
  } else if (selectedPeriodId === "ytd") {
    selectPeriod("ytd");
  } else {
    renderWeek(requested || latest);
  }
  window.dispatchEvent(
    new CustomEvent("dashboard:olo-loaded", { detail: { weekCount: weeks.length } })
  );
  return latest;
}

async function loadOloPay() {
  try {
    const res = await fetch(OLO_DATA_URL, { cache: "no-store" });
    if (!res.ok) {
      showNotice({
        title: "Olo Pay couldn't be loaded right now",
        message: "Try refreshing in a moment. If it keeps happening, share the technical details with the data team.",
        technical: `Request for ${OLO_DATA_URL} returned HTTP ${res.status}.`,
        fix: IMPORT_STEPS,
      });
      return;
    }
    renderOlo(normalizeOloData(await res.json()));
  } catch (err) {
    showNotice({
      title: "Olo Pay couldn't be displayed right now",
      message:
        "Try refreshing in a moment. If it keeps happening, share the technical details below with the data team.",
      technical: String(err?.message || err),
      fix: IMPORT_STEPS,
    });
  }
}

window.__oloPay = {
  normalizeOloData,
  aggregateWeeks,
  trendSeries,
  getDataStart,
  findWeekForPeriod,
  usd,
  compactUsd,
  count,
  compactCount,
  ticket,
  authPct,
  sharePct,
  wowLabel,
  wowPtsLabel,
  loadOloPay,
  renderOlo,
  selectPeriod,
  getLatestWeek() {
    return window.__oloPayState?.latest || null;
  },
  getSelectedWeek() {
    const weeks = window.__oloPayState?.weeks || [];
    if (selectedPeriodId === "ytd") return aggregateWeeks(weeks);
    return findWeekForPeriod(weeks, selectedPeriodId) || window.__oloPayState?.latest || null;
  },
  getWeeks() {
    return window.__oloPayState?.weeks || [];
  },
};

function startOloWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    loadOloPay();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => loadOloPay(), { once: true });
}

window.addEventListener("dashboard:period", (event) => {
  const periodId = event.detail?.periodId;
  if (!periodId) return;
  if (!window.__oloPayState?.weeks?.length) {
    selectedPeriodId = periodId;
    return;
  }
  selectPeriod(periodId);
});

document.addEventListener("DOMContentLoaded", startOloWhenUnlocked);
})();
