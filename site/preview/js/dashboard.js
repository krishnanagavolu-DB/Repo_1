/* global Chart */

window.KPI_SECTIONS = [
  {
    id: "protect-revenue",
    title: "Protect revenue",
    subtitle: "Highest urgency — lost approvals hit sales immediately",
    metrics: [
      {
        key: "auth_rate",
        label: "Auth rate",
        format: (v) => pct(v, 2),
        formatDelta: (d) => `${signed(d * 100, 2)} pts`,
        subValue: (period) => {
          const attempts = periodTotal(period, "auth_total_cnt");
          return attempts ? `(${compactCount(attempts)} attempts)` : "";
        },
        why: "Approval health — small drops mean lost tickets now",
      },
      {
        key: "decline_volume",
        label: "Decline $",
        format: (v) => compactMoney(v),
        formatDelta: (d) => compactMoney(d, true),
        invertDelta: true,
        why: "Revenue at risk this period, in dollars",
      },
      {
        key: "sales_volume",
        label: "Sales volume",
        format: (v) => compactMoney(v),
        formatDelta: (d) => compactMoney(d, true),
        why: "Top-line card-captured sales — is money flowing?",
      },
    ],
  },
  {
    id: "cost-margin",
    title: "Cost & margin",
    subtitle: "Next — preventable fee leakage and acceptance cost",
    metrics: [
      {
        key: "downgrade_rate",
        label: "Downgrade rate",
        format: (v) => pct(v, 2),
        formatDelta: (d) => `${signed(d * 100, 2)} pts`,
        invertDelta: true,
        why: "Often fixable (e.g. Level 2 data) — margin protection",
      },
      {
        key: "ic_fee",
        label: "IC fee $",
        format: (v) => compactMoney(v),
        formatDelta: (d) => compactMoney(d, true),
        invertDelta: true,
        why: "Absolute interchange cost this period",
      },
      {
        key: "ic_rate",
        label: "IC rate",
        format: (v) => pct(v, 2),
        formatDelta: (d) => `${signed(d * 100, 2)} pts`,
        invertDelta: true,
        why: "Blended interchange rate vs sales",
      },
    ],
  },
  {
    id: "volume-context",
    title: "Volume context",
    subtitle: "Watch trends — usually not a same-day fire drill",
    metrics: [
      {
        key: "returns_pct_of_sales",
        label: "Returns as % of sales",
        format: (v) => pct(v, 2),
        formatDelta: (d) => `${signed(d * 100, 2)} pts`,
        invertDelta: true,
        why: "Refund leakage relative to sales",
      },
      {
        key: "transaction_volume",
        label: "Transaction volume",
        format: (v) => compactCount(v),
        formatDelta: (d) => compactCount(d, true),
        why: "Ticket count companion to sales $",
      },
      {
        key: "aov",
        label: "AOV",
        format: (v) => money(v, 2),
        formatDelta: (d) => money(d, 2, true),
        why: "Average ticket — strategic, slower-moving",
      },
    ],
  },
];

window.KPI_ORDER = window.KPI_SECTIONS.flatMap((section) => section.metrics);

const KPI_ORDER = window.KPI_ORDER;
const KPI_SECTIONS = window.KPI_SECTIONS;

const MIX_COLORS = ["#006098", "#154167", "#F6E300", "#D9272D", "#4094A7", "#D2DCE5"];

let dashboardData = null;
window.__dashboardState = { data: null, periodId: null };
const charts = {
  trends: {},
  entry: null,
  payment: null,
  wallet: null,
  authEntry: null,
  declines: null,
};

function pct(value, digits = 2) {
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

/**
 * Share values in aligned legend columns always render at one decimal so the
 * column stays flush. Non-zero values that would round away are shown as <0.1%.
 */
function mixPct(value) {
  const share = Number(value) * 100;
  if (!Number.isFinite(share)) return "0.0%";
  if (share > 0 && share < 0.05) return "<0.1%";
  return `${share.toFixed(1)}%`;
}

function signed(value, digits = 2) {
  const n = Number(value);
  const abs = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs}`;
  return abs;
}

function money(value, digits = 2, withSign = false) {
  const n = Number(value);
  const abs = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (!withSign) return abs;
  if (n > 0) return `+${abs}`;
  if (n < 0) return `-${abs.replace("-", "")}`;
  return abs;
}

function compactMoney(value, withSign = false) {
  const n = Number(value);
  const abs = Math.abs(n);
  let text;
  if (abs >= 1_000_000) text = `$${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) text = `$${(abs / 1_000).toFixed(1)}K`;
  else text = `$${abs.toFixed(0)}`;
  if (!withSign) return n < 0 ? `-${text}` : text;
  if (n > 0) return `+${text}`;
  if (n < 0) return `-${text}`;
  return text;
}

function compactCount(value, withSign = false) {
  const n = Number(value);
  const abs = Math.abs(n);
  let text;
  if (abs >= 1_000_000) text = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) text = `${(abs / 1_000).toFixed(0)}K`;
  else text = abs.toFixed(0);
  if (!withSign) return n < 0 ? `-${text}` : text;
  if (n > 0) return `+${text}`;
  if (n < 0) return `-${text}`;
  return text;
}

/**
 * True when a formatted delta carries no magnitude at display precision, so a
 * movement of 0.0004 pts is not dressed up as a green gain of "+0.00 pts".
 */
function isZeroAtDisplayPrecision(text) {
  const digits = String(text).replace(/[^0-9]/g, "");
  return digits.length > 0 && /^0+$/.test(digits);
}

function stripSign(text) {
  return String(text).replace(/^[+-]\s*/, "");
}

function deltaDisplay(meta, kpiObj) {
  const delta = kpiObj.delta;
  if (delta === null || delta === undefined) {
    return { text: "—", className: "flat" };
  }
  const formatted = meta.formatDelta(delta);
  if (isZeroAtDisplayPrecision(formatted)) {
    return { text: `— ${stripSign(formatted)}`, className: "flat" };
  }
  const up = Number(delta) > 0;
  const improved = meta.invertDelta ? !up : up;
  return {
    text: `${up ? "▲" : "▼"} ${formatted}`,
    className: improved ? "up" : "down",
  };
}

/** Display-only rename so the real card bucket is not confused with grouped "Other". */
const MIX_LABEL_OVERRIDES = { "Card / Other": "Physical Card" };

function mixLabel(label) {
  return MIX_LABEL_OVERRIDES[label] || label;
}

window.__mixLabel = mixLabel;

window.__dashboardFormat = {
  mixPct,
  signed,
  money,
  compactMoney,
  compactCount,
  deltaDisplay,
  mixLabel,
};

function periodTotal(period, field) {
  const value = Number(period?.totals?.[field]);
  return Number.isFinite(value) ? value : null;
}

function populatePeriodSelect(data) {
  const select = document.getElementById("period-select");
  select.innerHTML = "";
  for (const week of data.periods.weeks) {
    const opt = document.createElement("option");
    opt.value = week.id;
    opt.textContent = week.label;
    select.appendChild(opt);
  }
  const ytd = document.createElement("option");
  ytd.value = "ytd";
  ytd.textContent = "YTD";
  select.appendChild(ytd);
  select.value = data.periods.weeks[data.periods.weeks.length - 1].id;
  select.addEventListener("change", () => {
    window.__dashboardState.periodId = select.value;
    renderPeriod(data, select.value);
    announcePeriod(select.value);
  });
}

/** Every channel follows this one control, so broadcast the selection. */
function announcePeriod(periodId) {
  window.dispatchEvent(new CustomEvent("dashboard:period", { detail: { periodId } }));
}

/** Card present reaches back further than the POS feed, so report its own start. */
function registerYtdCoverage(data) {
  const weeks = data?.periods?.weeks || [];
  if (!weeks.length) return;
  const startLabel = String(weeks[0].label || "").replace(/\s*–\s*/, "|").split("|")[0];
  const year = String(weeks[0].id || "").slice(0, 4);
  window.__ytdBanner?.register("worldpay", {
    startLabel: year ? `${startLabel}, ${year}` : startLabel,
    weekCount: weeks.length,
  });
}

function getPeriod(data, id) {
  if (id === "ytd") return data.periods.ytd;
  return data.periods.weeks.find((w) => w.id === id);
}

function renderKpis(period) {
  const board = document.getElementById("kpi-board") || document.getElementById("kpi-grid");
  board.innerHTML = "";
  board.className = "kpi-board";

  for (const section of KPI_SECTIONS) {
    const block = document.createElement("section");
    block.className = "kpi-section";
    block.innerHTML = `
      <div class="section-head kpi-section-head">
        <h2>${section.title}</h2>
        <p>${section.subtitle}</p>
      </div>
      <div class="kpi-grid" data-section="${section.id}"></div>
    `;
    const grid = block.querySelector(".kpi-grid");

    for (const meta of section.metrics) {
      const kpi = period.kpis[meta.key];
      if (!kpi) continue;
      const card = document.createElement("article");
      card.className = "kpi-card";
      card.title = meta.why || "";
      const delta = deltaDisplay(meta, kpi);
      const subValue = meta.subValue ? meta.subValue(period) : "";
      card.innerHTML = `
        <div class="label">${meta.label}</div>
        <div class="kpi-main">
          <div>
            <div class="kpi-value">${meta.format(kpi.value)}</div>
            ${subValue ? `<div class="kpi-subvalue">${subValue}</div>` : ""}
          </div>
          <div class="kpi-delta ${delta.className}">${delta.text}</div>
        </div>
        <div class="kpi-why">${meta.why || ""}</div>
        <div class="kpi-trend">
          <div class="trend-label">4-week trend</div>
          <canvas id="trend-${meta.key}" height="48"></canvas>
        </div>
      `;
      grid.appendChild(card);
    }
    board.appendChild(block);
  }

  for (const meta of KPI_ORDER) {
    const kpi = period.kpis[meta.key];
    if (!kpi) continue;
    const history = (kpi.history || []).slice(-4);
    const ctx = document.getElementById(`trend-${meta.key}`);
    if (!ctx) continue;
    if (charts.trends[meta.key]) {
      charts.trends[meta.key].destroy();
    }
    const last = history.length ? history[history.length - 1].value : kpi.value;
    const prev = history.length > 1 ? history[history.length - 2].value : last;
    const improved = meta.invertDelta ? last < prev : last > prev;
    const endColor = improved ? "#006098" : last === prev ? "#006098" : "#D9272D";
    const average = history.length
      ? history.reduce((sum, h) => sum + Number(h.value), 0) / history.length
      : null;
    charts.trends[meta.key] = new Chart(ctx, {
      type: "line",
      data: {
        labels: history.map((h) => h.week_start),
        datasets: [
          {
            label: "Weekly value",
            data: history.map((h) => h.value),
            borderColor: "#006098",
            backgroundColor: "transparent",
            borderWidth: 3,
            pointRadius: 3,
            pointBackgroundColor: history.map((_, i) =>
              i === history.length - 1 ? endColor : "#006098"
            ),
            tension: 0.25,
          },
          {
            label: "4-week average",
            data: history.map(() => average),
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
            enabled: true,
            filter: (item) => item.datasetIndex === 0,
          },
        },
        scales: {
          x: { display: false },
          y: { display: false },
        },
        elements: { point: { hoverRadius: 4 } },
      },
    });
  }
}

function resizeChartsSoon() {
  requestAnimationFrame(() => {
    Object.values(charts).forEach((chart) => {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
    Object.values(charts.trends || {}).forEach((chart) => {
      if (chart && typeof chart.resize === "function") chart.resize();
    });
  });
}

/** Roll tiny slices into Other; detail[] is shown on hover. */
function groupSmallMixItems(items, thresholdPct = 0.005) {
  const source = (items || []).filter((i) => i && Number(i.pct) >= 0);
  const kept = [];
  const small = [];
  for (const item of source) {
    if (Number(item.pct) < thresholdPct) small.push(item);
    else kept.push({ ...item });
  }
  if (!small.length) {
    kept.sort((a, b) => b.pct - a.pct || String(a.label).localeCompare(String(b.label)));
    return kept;
  }
  small.sort((a, b) => b.pct - a.pct || String(a.label).localeCompare(String(b.label)));
  kept.push({
    label: "Other",
    pct: small.reduce((sum, i) => sum + Number(i.pct), 0),
    count: small.reduce((sum, i) => sum + Number(i.count || 0), 0),
    detail: small.map((i) => ({
      label: i.label,
      pct: Number(i.pct),
      count: i.count,
    })),
  });
  kept.sort((a, b) => b.pct - a.pct || String(a.label).localeCompare(String(b.label)));
  return kept;
}

function renderMix(canvasId, legendId, items, chartKey, options = {}) {
  const list = options.groupUnder
    ? groupSmallMixItems(items, options.groupUnder)
    : (items || []).filter((i) => i && Number(i.pct) >= 0);
  const canvas = document.getElementById(canvasId);
  const legend = document.getElementById(legendId);
  if (!canvas || !legend) return;

  if (!list.length) {
    legend.innerHTML = `<tr><td colspan="2">No data for this period</td></tr>`;
    if (charts[chartKey]) {
      charts[chartKey].destroy();
      charts[chartKey] = null;
    }
    return;
  }

  const labels = list.map((i) => mixLabel(i.label));
  const values = list.map((i) => i.pct);
  const colors = labels.map((_, idx) => MIX_COLORS[idx % MIX_COLORS.length]);

  legend.innerHTML = list
    .map((item, idx) => {
      return `
      <tr>
        <td><span style="color:${colors[idx]}">●</span> ${mixLabel(item.label)}${
          item.detail?.length ? ` <span class="mix-hint">(${item.detail.length})</span>` : ""
        }</td>
        <td>${mixPct(item.pct)}</td>
      </tr>`;
    })
    .join("");

  if (charts[chartKey]) charts[chartKey].destroy();
  charts[chartKey] = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          data: values,
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
            title(tooltipItems) {
              const item = list[tooltipItems[0]?.dataIndex];
              return item ? mixLabel(item.label) : "";
            },
            label(ctx) {
              const item = list[ctx.dataIndex];
              if (!item) return "";
              if (item.detail?.length) {
                return [
                  `Combined ${mixPct(item.pct)}`,
                  ...item.detail.map((d) => `${mixLabel(d.label)}: ${pct(d.pct, 3)}`),
                ];
              }
              return mixPct(item.pct);
            },
          },
        },
      },
    },
  });
}

function renderAuthByEntry(items) {
  const canvas = document.getElementById("chart-auth-entry");
  if (!canvas) return;
  const rows = (items || []).slice(0, 6);
  if (charts.authEntry) charts.authEntry.destroy();
  if (!rows.length) {
    charts.authEntry = null;
    return;
  }
  charts.authEntry = new Chart(canvas, {
    type: "bar",
    data: {
      labels: rows.map((i) => i.label),
      datasets: [
        {
          data: rows.map((i) => Number(i.auth_rate) * 100),
          backgroundColor: ["#006098", "#154167", "#F6E300", "#D9272D", "#D2DCE5", "#4094A7"],
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${Number(ctx.raw).toFixed(2)}%`,
          },
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          grid: { color: "#eef2f6" },
          ticks: {
            color: "#69788b",
            callback: (v) => `${v}%`,
          },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#154167" },
        },
      },
    },
  });
}

/** Text list beside the decline chart so the panel stays readable without canvas. */
function renderDeclineList(items) {
  const list = document.getElementById("legend-declines");
  if (!list) return;
  const rows = (items || []).slice(0, 8);
  if (!rows.length) {
    list.innerHTML = `<tr><td colspan="3">No declines recorded for this period</td></tr>`;
    return;
  }
  const labelledTotal = (items || []).reduce((sum, i) => sum + Number(i.count || 0), 0);
  list.innerHTML = rows
    .map(
      (item) => `
      <tr>
        <td>${item.label}</td>
        <td>${Number(item.count).toLocaleString("en-US")}</td>
        <td>${labelledTotal ? mixPct(Number(item.count) / labelledTotal) : "0.0%"}</td>
      </tr>`
    )
    .join("");
}

function renderDeclines(items) {
  const canvas = document.getElementById("chart-declines");
  if (!canvas) return;
  const top = (items || []).slice(0, 8);
  if (charts.declines) charts.declines.destroy();
  if (!top.length) {
    charts.declines = null;
    return;
  }
  charts.declines = new Chart(canvas, {
    type: "bar",
    data: {
      labels: top.map((i) => i.label),
      datasets: [
        {
          data: top.map((i) => i.count),
          backgroundColor: ["#D9272D", "#006098", "#F6E300", "#154167", "#D2DCE5", "#4094A7", "#E99F41", "#DE5C36"],
          borderRadius: 4,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          grid: { color: "#eef2f6" },
          ticks: { color: "#69788b" },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#154167" },
        },
      },
    },
  });
}

function renderPeriod(data, periodId) {
  const period = getPeriod(data, periodId);
  if (!period) return;
  window.__dashboardState = { data, periodId };
  renderKpis(period);
  renderMix("chart-entry", "legend-entry", period.entry_method_mix || [], "entry");
  renderMix("chart-payment", "legend-payment", period.payment_type_mix || [], "payment");
  renderMix("chart-wallet", "legend-wallet", period.wallet_mix || [], "wallet", { groupUnder: 0.005 });
  renderAuthByEntry(period.auth_rate_by_entry || []);
  renderDeclines(period.decline_reasons || []);
  renderDeclineList(period.decline_reasons || []);
  resizeChartsSoon();
}

/** YTD ships without a totals block, so sum the weekly totals for denominators. */
function withDerivedTotals(data) {
  const ytd = data?.periods?.ytd;
  if (ytd && !ytd.totals) {
    ytd.totals = (data.periods.weeks || []).reduce((acc, week) => {
      for (const [field, value] of Object.entries(week.totals || {})) {
        acc[field] = (acc[field] || 0) + Number(value);
      }
      return acc;
    }, {});
  }
  return data;
}

async function loadDashboard() {
  try {
    const res = await fetch("data/dashboard.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dashboard.json (${res.status})`);
    dashboardData = withDerivedTotals(await res.json());
    document.getElementById("scope-line").textContent =
      dashboardData.meta?.scope || "Company owned shops only";
    populatePeriodSelect(dashboardData);
    registerYtdCoverage(dashboardData);
    const periodId = document.getElementById("period-select").value;
    window.__dashboardState = { data: dashboardData, periodId };
    renderPeriod(dashboardData, periodId);
    announcePeriod(periodId);
  } catch (err) {
    const page = document.querySelector(".page");
    const box = document.createElement("div");
    box.className = "notice notice-error";
    box.innerHTML =
      window.__notices?.noticeHtml({
        title: "This week's numbers aren't available right now",
        message:
          "The Worldpay metrics could not be loaded. Try refreshing in a moment — if it keeps happening, share the technical details below with the data team.",
        technical: err.message,
        fix: [
          "Refresh the page — most load failures are temporary.",
          "Confirm the weekly publish finished by checking that <code>site/preview/data/dashboard.json</code> exists in the repository.",
          "If the file is missing, rerun the weekly ingest and certification, then redeploy.",
        ],
      }) || `Dashboard failed to load: ${err.message}`;
    page.prepend(box);
  }
}

function startDashboardWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    loadDashboard();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => loadDashboard(), { once: true });
}

document.addEventListener("DOMContentLoaded", startDashboardWhenUnlocked);
