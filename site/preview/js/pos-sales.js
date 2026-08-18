/* In Shop POS Sales tab: reads data/in_shop_sales_data.json published with the site. */

(function () {
const POS_DATA_URL = "data/in_shop_sales_data.json";
const TENDER_ORDER = ["Card", "Cash", "Gift Card / Dutch Pass"];
const TENDER_COLORS = {
  Card: "#005F98",
  Cash: "#132550",
  "Gift Card / Dutch Pass": "#FDE021",
};

let posChart = null;
let selectedPeriodId = null;

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

/** Approximate dollars for executive cards: $31.7M, $7.4M, $450K. */
function compactUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(abs / 1_000).toFixed(0)}K`;
  return usd(n);
}

function compactCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(abs / 1_000).toFixed(0)}K`;
  return String(Math.round(abs));
}

function sharePct(value) {
  const share = Number(value) * 100;
  if (!Number.isFinite(share)) return "0.0%";
  if (share > 0 && share < 0.05) return "<0.1%";
  return `${share.toFixed(1)}%`;
}

/** Export week_over_week values are already percent changes (e.g. -2.1). */
function wowLabel(pctChange) {
  if (pctChange === null || pctChange === undefined || pctChange === "") return null;
  const n = Number(pctChange);
  if (!Number.isFinite(n)) return null;
  const abs = Math.abs(n).toFixed(1);
  if (n > 0) return { text: `+${abs}% vs prior week`, tone: "up" };
  if (n < 0) return { text: `-${abs}% vs prior week`, tone: "down" };
  return { text: "— 0.0% vs prior week", tone: "flat" };
}

function tenderColor(label, idx = 0) {
  return TENDER_COLORS[label] || ["#005F98", "#132550", "#FDE021"][idx % 3];
}

const START_KEYS = ["week_start", "week_start_date", "week", "date", "period_start", "start_date"];
const END_KEYS = ["week_end", "week_end_date", "period_end", "end_date"];

/** "2026-08-10" -> "Aug 10". Returns null for anything that is not an ISO date. */
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
  const start = firstString(week, START_KEYS);
  const end = firstString(week, END_KEYS);
  const startPart = shortDate(start);
  const endPart = shortDate(end);
  if (startPart && endPart) return `${startPart.text} – ${endPart.text}, ${endPart.year}`;
  if (start && end) return `${start} – ${end}`;
  return start || "Most recent week";
}

function weekSortKey(week) {
  return firstString(week, START_KEYS) || firstString(week, END_KEYS) || "";
}

const AMOUNT_KEYS = [
  "amount",
  "amt",
  "dollar_volume",
  "sales_amt",
  "SALES_VOLUME",
  "sales_volume",
  "total",
  "total_amount",
  "value",
];
const PCT_KEYS = [
  "pct",
  "percent",
  "percentage",
  "share",
  "pct_of_total",
  "pct_of_total_sales",
  "pct_of_sales",
];
const TXN_KEYS = ["TRANSACTION_COUNT", "transaction_count", "transaction_cnt", "transactions", "txn_cnt", "count"];

/** Accepts an array of tender rows or a keyed object, and fills in missing shares. */
function normalizeTenderMix(raw) {
  let rows = [];
  if (Array.isArray(raw)) {
    rows = raw.map((item) => ({
      label:
        firstString(item, ["label", "tender", "tender_type", "payment_type", "name", "type"]) ||
        "Unknown",
      amount: firstNumber(item, AMOUNT_KEYS),
      pct: firstNumber(item, PCT_KEYS),
      transactions: firstNumber(item, TXN_KEYS),
      components: item?.components || null,
    }));
  } else if (raw && typeof raw === "object") {
    rows = Object.entries(raw).map(([key, item]) => {
      if (item !== null && typeof item === "object") {
        return {
          label: firstString(item, ["label", "tender", "name"]) || key,
          amount: firstNumber(item, AMOUNT_KEYS),
          pct: firstNumber(item, PCT_KEYS),
          transactions: firstNumber(item, TXN_KEYS),
          components: item.components || null,
        };
      }
      return { label: key, amount: Number(item), pct: null, transactions: null, components: null };
    });
  }

  rows = rows.filter((row) => Number.isFinite(row.amount));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  for (const row of rows) {
    if (!Number.isFinite(row.pct)) {
      row.pct = total ? row.amount / total : 0;
    } else if (row.pct > 1.0000001) {
      row.pct = row.pct / 100;
    }
  }

  rows.sort((a, b) => {
    const ai = TENDER_ORDER.indexOf(a.label);
    const bi = TENDER_ORDER.indexOf(b.label);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.amount - a.amount;
  });

  return { rows, total };
}

const COMPONENT_LABELS = {
  GIFT: "Gift Card",
  CUSTOM: "Dutch Pass",
  gift: "Gift Card",
  custom: "Dutch Pass",
  "Gift Card": "Gift Card",
  "Dutch Pass": "Dutch Pass",
};

function normalizeGiftSplit(tenders) {
  const giftRow = (tenders || []).find(
    (row) => /gift|dutch pass/i.test(row.label) && row.components && typeof row.components === "object"
  );
  if (!giftRow) return null;
  const parts = Object.entries(giftRow.components)
    .map(([key, value]) => {
      const amount =
        value !== null && typeof value === "object"
          ? firstNumber(value, AMOUNT_KEYS)
          : Number(value);
      if (!Number.isFinite(amount)) return null;
      return {
        label: COMPONENT_LABELS[key] || key,
        amount,
        transactions:
          value !== null && typeof value === "object" ? firstNumber(value, TXN_KEYS) : null,
      };
    })
    .filter(Boolean);
  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  if (!total) return null;
  for (const part of parts) part.pct = part.amount / total;
  const order = ["Gift Card", "Dutch Pass"];
  parts.sort((a, b) => {
    const ai = order.indexOf(a.label);
    const bi = order.indexOf(b.label);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.amount - a.amount;
  });
  return { parentLabel: giftRow.label, parentAmount: giftRow.amount, parts, total };
}

/** YTD is every published week rolled up — there is no prior period to compare. */
function aggregateWeeks(weeks) {
  if (!weeks?.length) return null;

  const byLabel = new Map();
  const giftParts = new Map();
  let reportedTotal = 0;
  let transactions = 0;
  let hasTransactions = false;

  for (const week of weeks) {
    for (const tender of week.tenders) {
      const row = byLabel.get(tender.label) || { label: tender.label, amount: 0, transactions: 0 };
      row.amount += Number(tender.amount) || 0;
      if (Number.isFinite(tender.transactions)) row.transactions += tender.transactions;
      byLabel.set(tender.label, row);
    }
    for (const part of week.giftSplit?.parts || []) {
      const row = giftParts.get(part.label) || { label: part.label, amount: 0 };
      row.amount += Number(part.amount) || 0;
      giftParts.set(part.label, row);
    }
    reportedTotal += Number.isFinite(week.reportedTotal) ? week.reportedTotal : week.tenderTotal;
    if (Number.isFinite(week.transactions)) {
      transactions += week.transactions;
      hasTransactions = true;
    }
  }

  const tenders = [...byLabel.values()];
  const tenderTotal = tenders.reduce((sum, row) => sum + row.amount, 0);
  for (const row of tenders) row.pct = tenderTotal ? row.amount / tenderTotal : 0;
  tenders.sort((a, b) => {
    const ai = TENDER_ORDER.indexOf(a.label);
    const bi = TENDER_ORDER.indexOf(b.label);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.amount - a.amount;
  });

  let giftSplit = null;
  const parts = [...giftParts.values()];
  const giftTotal = parts.reduce((sum, part) => sum + part.amount, 0);
  if (parts.length && giftTotal) {
    for (const part of parts) part.pct = part.amount / giftTotal;
    const order = ["Gift Card", "Dutch Pass"];
    parts.sort((a, b) => {
      const ai = order.indexOf(a.label);
      const bi = order.indexOf(b.label);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return b.amount - a.amount;
    });
    const parent = tenders.find((row) => /gift|dutch pass/i.test(row.label));
    giftSplit = {
      parentLabel: parent?.label || "Gift Card / Dutch Pass",
      parentAmount: parent?.amount ?? giftTotal,
      parts,
      total: giftTotal,
    };
  }

  const first = weeks[0].label.replace(/\s*–.*$/, "");
  const last = weeks[weeks.length - 1].label.replace(/^.*–\s*/, "");

  return {
    label: `YTD · ${first} – ${last}`,
    sortKey: "ytd",
    weekCount: weeks.length,
    tenders,
    tenderTotal,
    reportedTotal,
    transactions: hasTransactions ? transactions : null,
    avgTicket: hasTransactions && transactions ? reportedTotal / transactions : null,
    wow: { salesPct: null, transactionsPct: null },
    giftSplit,
    coverage: weeks[weeks.length - 1].coverage,
  };
}

function normalizeWow(week) {
  const raw = week?.week_over_week || week?.wow || {};
  return {
    salesPct: firstNumber(raw, ["SALES_VOLUME_PCT", "sales_volume_pct", "sales_pct", "sales"]),
    transactionsPct: firstNumber(raw, [
      "TRANSACTION_COUNT_PCT",
      "transaction_count_pct",
      "transactions_pct",
      "transactions",
    ]),
  };
}

function normalizeCoverage(week, rootCoverage) {
  const coverage = week?.shop_coverage || week?.coverage || rootCoverage || {};
  return {
    missingCount: firstNumber(coverage, [
      "missing_shops_count",
      "missing_count",
      "missing_shops",
      "excluded_shops_count",
    ]) || 0,
    note: firstString(coverage, ["missing_shops_note", "note", "missing_note", "details"]),
    includedCount: firstNumber(coverage, ["included_shops_count", "shops_included", "shop_count"]),
  };
}

/** Accepts a bare array of weeks or a wrapper object. */
function normalizePosData(raw) {
  let weeks = [];
  if (Array.isArray(raw)) weeks = raw;
  else if (Array.isArray(raw?.weeks)) weeks = raw.weeks;
  else if (Array.isArray(raw?.data)) weeks = raw.data;
  else if (Array.isArray(raw?.periods)) weeks = raw.periods;
  else if (raw && typeof raw === "object") weeks = [raw];

  const rootCoverage = (!Array.isArray(raw) && (raw?.shop_coverage || raw?.coverage)) || null;

  const normalized = weeks
    .map((week) => {
      const { rows, total } = normalizeTenderMix(week?.tender_mix || week?.tenders || week?.mix);
      const totals = week?.totals || {};
      const reportedTotal = firstNumber(totals, [
        "sales_amt",
        "SALES_VOLUME",
        "sales_volume",
        "total_sales",
        "net_sales",
        "amount",
        "total",
      ]);
      const transactions = firstNumber(totals, TXN_KEYS);
      return {
        label: weekLabel(week),
        sortKey: weekSortKey(week),
        tenders: rows,
        tenderTotal: total,
        reportedTotal,
        transactions,
        avgTicket:
          firstNumber(totals, ["AVG_TICKET", "avg_ticket", "average_ticket"]) ??
          (reportedTotal && transactions ? reportedTotal / transactions : null),
        wow: normalizeWow(week),
        giftSplit: normalizeGiftSplit(rows),
        coverage: normalizeCoverage(week, rootCoverage),
      };
    })
    .filter((week) => week.tenders.length);

  normalized.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  return normalized;
}

const TREND_METRICS = {
  sales: (week) => week.reportedTotal ?? week.tenderTotal,
  payments: (week) => week.transactions,
};

/** Sparkline points for a summary card, oldest week first. */
function trendSeries(weeks, metric) {
  const pick = TREND_METRICS[metric];
  if (!pick || !weeks?.length) return [];
  const points = weeks
    .map((week) => ({ label: week.label, value: Number(pick(week)) }))
    .filter((point) => Number.isFinite(point.value));
  return points.length > 1 ? points : [];
}

/** Earliest published week, used by the YTD banner. */
function getDataStart(weeks) {
  if (!weeks?.length) return null;
  return {
    startLabel: `${weeks[0].label.replace(/\s*–.*$/, "")}, ${weeks[0].sortKey.slice(0, 4)}`,
    weekCount: weeks.length,
  };
}

function sumMoney(values) {
  return Math.round(values.reduce((sum, value) => sum + Number(value || 0), 0) * 100) / 100;
}

/** YTD for All payments is every week currently held by this feed. */
function aggregateWeeks(weeks) {
  if (!weeks?.length) return null;
  const tenders = TENDER_ORDER.map((label) => {
    const sourceRows = weeks
      .map((week) => week.tenders.find((tender) => tender.label === label))
      .filter(Boolean);
    const amount = sumMoney(sourceRows.map((row) => row.amount));
    const transactions = sourceRows.reduce(
      (sum, row) => sum + Number(row.transactions || 0),
      0
    );
    const componentKeys = new Set(
      sourceRows.flatMap((row) => Object.keys(row.components || {}))
    );
    const components = Object.fromEntries(
      [...componentKeys].map((key) => [
        key,
        {
          amount: sumMoney(
            sourceRows.map((row) => firstNumber(row.components?.[key] || {}, AMOUNT_KEYS))
          ),
          TRANSACTION_COUNT: sourceRows.reduce(
            (sum, row) =>
              sum + Number(firstNumber(row.components?.[key] || {}, TXN_KEYS) || 0),
            0
          ),
        },
      ])
    );
    return {
      label,
      amount,
      transactions,
      components: componentKeys.size ? components : null,
      pct: 0,
    };
  });
  const tenderTotal = sumMoney(tenders.map((tender) => tender.amount));
  for (const tender of tenders) tender.pct = tenderTotal ? tender.amount / tenderTotal : 0;
  const transactions = weeks.reduce((sum, week) => sum + Number(week.transactions || 0), 0);
  const first = weeks[0].label.replace(/\s*–.*$/, "");
  const last = weeks[weeks.length - 1].label.replace(/^.*–\s*/, "");
  const aggregate = {
    label: `YTD · ${first} – ${last}`,
    sortKey: "ytd",
    tenders,
    tenderTotal,
    reportedTotal: sumMoney(
      weeks.map((week) => week.reportedTotal ?? week.tenderTotal)
    ),
    transactions,
    avgTicket: transactions ? tenderTotal / transactions : null,
    wow: { salesPct: null, transactionsPct: null },
    coverage: {},
  };
  aggregate.giftSplit = normalizeGiftSplit(tenders);
  return aggregate;
}

function renderBanner() {
  // Non–company-owned stands are filtered by design across every channel.
  // Do not advertise that exclusion on the page.
}

function deltaHtml(wow) {
  if (!wow) return "";
  return `<div class="kpi-delta ${wow.tone}">${wow.text}</div>`;
}

function renderSummary(week) {
  const grid = document.getElementById("pos-summary-grid");
  if (!grid) return;
  const sales = week.reportedTotal ?? week.tenderTotal;
  const salesWow = wowLabel(week.wow?.salesPct);
  const txnWow = wowLabel(week.wow?.transactionsPct);
  const weeks = window.__posSalesState?.weeks || [];
  const cards = [
    {
      label: "Total sales",
      value: compactUsd(sales),
      detail: usd(sales),
      delta: salesWow,
      metric: "sales",
    },
    {
      // The source counts deduplicated payment lines, not unique ORDER_IDs.
      label: "Payments",
      value: week.transactions != null ? compactCount(week.transactions) : "—",
      detail:
        week.transactions != null ? Number(week.transactions).toLocaleString("en-US") : null,
      delta: txnWow,
      metric: "payments",
    },
    {
      label: "Avg payment",
      value: week.avgTicket != null ? `$${Number(week.avgTicket).toFixed(2)}` : "—",
      detail: null,
      delta: null,
    },
  ];
  grid.innerHTML = cards
    .map((card) => {
      const series = card.metric ? trendSeries(weeks, card.metric) : [];
      const trend = series.length
        ? `<div class="kpi-trend">
             <div class="trend-label">${series.length}-week trend</div>
             <canvas id="pos-trend-${card.metric}" height="48"></canvas>
           </div>`
        : "";
      return `
      <article class="kpi-card pos-summary-card">
        <div class="label">${card.label}</div>
        <div class="kpi-value">${card.value}</div>
        ${card.detail ? `<div class="kpi-subvalue">${card.detail}</div>` : ""}
        ${deltaHtml(card.delta)}
        ${trend}
      </article>`;
    })
    .join("");

  for (const card of cards) {
    if (card.metric) renderTrend(card.metric, trendSeries(weeks, card.metric), week);
  }
}

const trendCharts = {};

function renderTrend(metric, series, activeWeek) {
  const canvas = document.getElementById(`pos-trend-${metric}`);
  if (!canvas || typeof Chart === "undefined" || !series.length) return;
  if (trendCharts[metric]) trendCharts[metric].destroy();
  const values = series.map((point) => point.value);
  const last = values[values.length - 1];
  const prev = values.length > 1 ? values[values.length - 2] : last;
  const endColor = last < prev ? "#D7282F" : "#005F98";
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  // On YTD every week feeds the aggregate, so no single point is highlighted.
  const currentIndex = series.findIndex((point) => point.label === activeWeek?.label);
  const format = (value) =>
    metric === "sales" ? usd(value) : Number(value).toLocaleString("en-US");

  trendCharts[metric] = new Chart(canvas, {
    type: "line",
    data: {
      labels: series.map((point) => point.label),
      datasets: [
        {
          label: "Weekly value",
          data: values,
          borderColor: "#005F98",
          backgroundColor: "transparent",
          borderWidth: 3,
          pointRadius: series.map((_, idx) => (idx === currentIndex ? 5 : 3)),
          pointBackgroundColor: series.map((_, idx) =>
            idx === values.length - 1 ? endColor : "#005F98"
          ),
          tension: 0.25,
        },
        {
          label: "Average",
          data: values.map(() => average),
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
        legend: { display: false },
        tooltip: {
          filter: (item) => item.datasetIndex === 0,
          callbacks: {
            title: (items) => items[0]?.label || "",
            label: (ctx) => format(ctx.raw),
          },
        },
      },
      scales: { x: { display: false }, y: { display: false } },
      elements: { point: { hoverRadius: 4 } },
    },
  });
}

function renderCards(week) {
  const grid = document.getElementById("pos-kpi-grid");
  if (!grid) return;
  grid.innerHTML = week.tenders
    .map(
      (tender, idx) => `
      <article class="kpi-card pos-card">
        <div class="label">${tender.label}</div>
        <div class="kpi-share" style="color:${tenderColor(tender.label, idx)}">${sharePct(
          tender.pct
        )}</div>
        <div class="kpi-subvalue">${compactUsd(tender.amount)} of total sales</div>
      </article>`
    )
    .join("");
}

function renderLegend(el, rows, colors) {
  if (!el) return;
  el.innerHTML = rows
    .map(
      (row, idx) => `
      <tr>
        <td><span style="color:${colors[idx]}">●</span> ${row.label}</td>
        <td>${sharePct(row.pct)} <span class="mix-hint">${compactUsd(row.amount)}</span></td>
      </tr>`
    )
    .join("");
}

function renderChart(week) {
  const canvas = document.getElementById("chart-pos-tender");
  const legend = document.getElementById("legend-pos-tender");
  if (!canvas || typeof Chart === "undefined") return;
  if (posChart) posChart.destroy();
  const colors = week.tenders.map((t, idx) => tenderColor(t.label, idx));
  renderLegend(legend, week.tenders, colors);
  posChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: week.tenders.map((t) => t.label),
      datasets: [
        {
          data: week.tenders.map((t) => t.pct),
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
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const tender = week.tenders[ctx.dataIndex];
              if (!tender) return "";
              return `${sharePct(tender.pct)} · ${compactUsd(tender.amount)}`;
            },
          },
        },
      },
    },
  });
}

let giftChart = null;
const GIFT_COLORS = { "Gift Card": "#FDE021", "Dutch Pass": "#005F98" };

function renderGiftSplit(week) {
  const panel = document.getElementById("pos-gift-panel");
  const canvas = document.getElementById("chart-pos-gift");
  const legend = document.getElementById("legend-pos-gift");
  const note = document.getElementById("pos-gift-note");
  if (!panel || !canvas) return;
  const split = week.giftSplit;
  if (!split?.parts?.length) {
    panel.hidden = true;
    if (giftChart) {
      giftChart.destroy();
      giftChart = null;
    }
    return;
  }
  panel.hidden = false;
  if (note) {
    note.textContent = `Of the ${compactUsd(split.parentAmount)} Gift Card / Dutch Pass tender`;
  }
  const colors = split.parts.map(
    (part, idx) => GIFT_COLORS[part.label] || ["#FDE021", "#005F98", "#132550"][idx % 3]
  );
  renderLegend(legend, split.parts, colors);
  if (giftChart) giftChart.destroy();
  giftChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: split.parts.map((p) => p.label),
      datasets: [{ data: split.parts.map((p) => p.pct), backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const part = split.parts[ctx.dataIndex];
              if (!part) return "";
              return `${sharePct(part.pct)} · ${compactUsd(part.amount)}`;
            },
          },
        },
      },
    },
  });
}

const IMPORT_STEPS = [
  "Export the weekly file from Snowflake to <code>in_shop_sales_data.json</code>.",
  "Run <code>python3 scripts/import_pos_sales.py &lt;path-to-export&gt; --preview-only</code> to validate and copy it into the site data.",
  "Commit the updated <code>site/preview/data/in_shop_sales_data.json</code> and redeploy.",
];

function showNotice(options) {
  const empty = document.getElementById("pos-empty");
  const content = document.getElementById("pos-content");
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
  const empty = document.getElementById("pos-empty");
  const content = document.getElementById("pos-content");
  if (!empty || !content) return;
  empty.hidden = true;
  content.hidden = false;
}

function notPublishedNotice(technical) {
  showNotice({
    title: "All payments for this week aren't published yet",
    message: "Once the weekly POS export is loaded, tender mix will appear here.",
    technical,
    fix: IMPORT_STEPS,
  });
}

/** Worldpay period ids are week-start dates, which match the POS sort keys. */
function findWeekForPeriod(weeks, periodId) {
  if (!periodId || periodId === "ytd") return null;
  return weeks.find((week) => week.sortKey === periodId) || null;
}

function renderWeek(week) {
  const periodEl = document.getElementById("pos-period-label");
  if (periodEl) periodEl.textContent = week.label;
  renderBanner(week);
  renderSummary(week);
  renderCards(week);
  renderChart(week);
  renderGiftSplit(week);
  showReady();
}

function selectPeriod(periodId) {
  const weeks = window.__posSalesState?.weeks || [];
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
      title: "All payments isn't published for this week yet",
      message: `Pick another week — tender mix is available for ${available}.`,
      technical: `No POS week matches period id "${periodId}" in ${POS_DATA_URL}.`,
      fix: IMPORT_STEPS,
    });
    return;
  }
  renderWeek(match);
}

function renderPos(weeks) {
  if (!weeks.length) {
    window.__posSalesState = { weeks: [], latest: null };
    notPublishedNotice(
      `No usable weeks found in ${POS_DATA_URL}. Each week needs a tender_mix with labels and amounts.`
    );
    return;
  }
  const latest = weeks[weeks.length - 1];
  window.__posSalesState = { weeks, latest };
  window.__ytdBanner?.register("pos", getDataStart(weeks));
  const requested = findWeekForPeriod(weeks, selectedPeriodId);
  if (selectedPeriodId && !requested) selectPeriod(selectedPeriodId);
  else renderWeek(requested || latest);
  window.dispatchEvent(new CustomEvent("dashboard:pos-loaded", { detail: { weekCount: weeks.length } }));
  return latest;
}

async function loadPosSales() {
  try {
    const res = await fetch(POS_DATA_URL, { cache: "no-store" });
    if (!res.ok) {
      notPublishedNotice(`Request for ${POS_DATA_URL} returned HTTP ${res.status}.`);
      return;
    }
    renderPos(normalizePosData(await res.json()));
  } catch (err) {
    showNotice({
      title: "All payments couldn't be displayed right now",
      message:
        "Try refreshing in a moment. If it keeps happening, share the technical details below with the data team.",
      technical: String(err?.message || err),
      fix: IMPORT_STEPS,
    });
  }
}

window.__posSales = {
  normalizePosData,
  normalizeTenderMix,
  normalizeGiftSplit,
  aggregateWeeks,
  trendSeries,
  getDataStart,
  findWeekForPeriod,
  usd,
  compactUsd,
  compactCount,
  sharePct,
  wowLabel,
  loadPosSales,
  renderPos,
  selectPeriod,
  getLatestWeek() {
    return window.__posSalesState?.latest || null;
  },
  getSelectedWeek() {
    const weeks = window.__posSalesState?.weeks || [];
    if (selectedPeriodId === "ytd") return aggregateWeeks(weeks);
    return findWeekForPeriod(weeks, selectedPeriodId) || window.__posSalesState?.latest || null;
  },
  getWeeks() {
    return window.__posSalesState?.weeks || [];
  },
};

function startPosWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    loadPosSales();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => loadPosSales(), { once: true });
}

window.addEventListener("dashboard:period", (event) => {
  const periodId = event.detail?.periodId;
  if (!periodId) return;
  if (!window.__posSalesState?.weeks?.length) {
    selectedPeriodId = periodId;
    return;
  }
  selectPeriod(periodId);
});

document.addEventListener("DOMContentLoaded", startPosWhenUnlocked);
})();
