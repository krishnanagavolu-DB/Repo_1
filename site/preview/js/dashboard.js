/* global Chart */

window.KPI_ORDER = [
  {
    key: "auth_rate",
    label: "Auth rate",
    format: (v) => pct(v, 2),
    formatDelta: (d) => `${signed(d * 100, 2)} pts`,
  },
  {
    key: "aov",
    label: "AOV",
    format: (v) => money(v, 2),
    formatDelta: (d) => money(d, 2, true),
  },
  {
    key: "returns_pct_of_sales",
    label: "Returns as % of sales",
    format: (v) => pct(v, 2),
    formatDelta: (d) => `${signed(d * 100, 2)} pts`,
    invertDelta: true,
  },
  {
    key: "sales_volume",
    label: "Sales volume",
    format: (v) => compactMoney(v),
    formatDelta: (d) => compactMoney(d, true),
  },
  {
    key: "transaction_volume",
    label: "Transaction volume",
    format: (v) => compactCount(v),
    formatDelta: (d) => compactCount(d, true),
  },
  {
    key: "ic_rate",
    label: "IC rate",
    format: (v) => pct(v, 2),
    formatDelta: (d) => `${signed(d * 100, 2)} pts`,
    invertDelta: true,
  },
  {
    key: "decline_volume",
    label: "Decline $",
    format: (v) => compactMoney(v),
    formatDelta: (d) => compactMoney(d, true),
    invertDelta: true,
  },
  {
    key: "ic_fee",
    label: "IC fee $",
    format: (v) => compactMoney(v),
    formatDelta: (d) => compactMoney(d, true),
    invertDelta: true,
  },
  {
    key: "downgrade_rate",
    label: "Downgrade rate",
    format: (v) => pct(v, 2),
    formatDelta: (d) => `${signed(d * 100, 2)} pts`,
    invertDelta: true,
  },
];

const KPI_ORDER = window.KPI_ORDER;

const MIX_COLORS = ["#005F98", "#132550", "#FDE021", "#D7282F", "#9FE5FA", "#69788b"];

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

function signed(value, digits = 2) {
  const n = Number(value);
  const abs = Math.abs(n).toFixed(digits);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
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
  if (n < 0) return `−${abs.replace("-", "")}`;
  return abs;
}

function compactMoney(value, withSign = false) {
  const n = Number(value);
  const abs = Math.abs(n);
  let text;
  if (abs >= 1_000_000) text = `$${(abs / 1_000_000).toFixed(1)}M`;
  else if (abs >= 1_000) text = `$${(abs / 1_000).toFixed(1)}K`;
  else text = `$${abs.toFixed(0)}`;
  if (!withSign) return n < 0 && !text.startsWith("-") ? `−${text}` : text;
  if (n > 0) return `+${text}`;
  if (n < 0) return `−${text.replace("−", "").replace("-", "")}`;
  return text;
}

function compactCount(value, withSign = false) {
  const n = Number(value);
  const abs = Math.abs(n);
  let text;
  if (abs >= 1_000_000) text = `${(abs / 1_000_000).toFixed(2)}M`;
  else if (abs >= 1_000) text = `${(abs / 1_000).toFixed(0)}K`;
  else text = abs.toFixed(0);
  if (!withSign) return text;
  if (n > 0) return `+${text}`;
  if (n < 0) return `−${text}`;
  return text;
}

function deltaClass(delta, invert = false) {
  if (delta === null || delta === undefined || Number(delta) === 0) return "flat";
  const up = Number(delta) > 0;
  if (invert) return up ? "down" : "up";
  return up ? "up" : "down";
}

function deltaText(meta, kpiObj) {
  const delta = kpiObj.delta;
  if (delta === null || delta === undefined) return "—";
  const arrow = Number(delta) > 0 ? "▲" : Number(delta) < 0 ? "▼" : "•";
  return `${arrow} ${meta.formatDelta(delta)}`;
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
  });
}

function getPeriod(data, id) {
  if (id === "ytd") return data.periods.ytd;
  return data.periods.weeks.find((w) => w.id === id);
}

function renderKpis(period) {
  const grid = document.getElementById("kpi-grid");
  grid.innerHTML = "";

  for (const meta of KPI_ORDER) {
    const kpi = period.kpis[meta.key];
    if (!kpi) continue;
    const card = document.createElement("article");
    card.className = "kpi-card";
    card.innerHTML = `
      <div class="label">${meta.label}</div>
      <div class="kpi-main">
        <div class="kpi-value">${meta.format(kpi.value)}</div>
        <div class="kpi-delta ${deltaClass(kpi.delta, meta.invertDelta)}">${deltaText(meta, kpi)}</div>
      </div>
      <div class="kpi-trend">
        <div class="trend-label">4-week trend</div>
        <canvas id="trend-${meta.key}" height="48"></canvas>
      </div>
    `;
    grid.appendChild(card);
  }

  for (const meta of KPI_ORDER) {
    const kpi = period.kpis[meta.key];
    if (!kpi) continue;
    const history = (kpi.history || []).slice(-4);
    const ctx = document.getElementById(`trend-${meta.key}`);
    if (charts.trends[meta.key]) {
      charts.trends[meta.key].destroy();
    }
    const last = history.length ? history[history.length - 1].value : kpi.value;
    const prev = history.length > 1 ? history[history.length - 2].value : last;
    const improved = meta.invertDelta ? last < prev : last > prev;
    const endColor = improved ? "#005F98" : last === prev ? "#005F98" : "#D7282F";
    charts.trends[meta.key] = new Chart(ctx, {
      type: "line",
      data: {
        labels: history.map((h) => h.week_start),
        datasets: [
          {
            data: history.map((h) => h.value),
            borderColor: "#005F98",
            backgroundColor: "transparent",
            borderWidth: 3,
            pointRadius: 3,
            pointBackgroundColor: history.map((_, i) =>
              i === history.length - 1 ? endColor : "#005F98"
            ),
            tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: true } },
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

function renderMix(canvasId, legendId, items, chartKey) {
  const list = (items || []).filter((i) => i && Number(i.pct) >= 0);
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

  const labels = list.map((i) => i.label);
  const values = list.map((i) => i.pct);
  const colors = labels.map((_, idx) => MIX_COLORS[idx % MIX_COLORS.length]);

  legend.innerHTML = list
    .map(
      (item, idx) => `
      <tr>
        <td><span style="color:${colors[idx]}">●</span> ${item.label}</td>
        <td>${pct(item.pct, 1)}</td>
      </tr>`
    )
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
      plugins: { legend: { display: false } },
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
          backgroundColor: ["#005F98", "#132550", "#FDE021", "#D7282F", "#69788b", "#9FE5FA"],
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
          ticks: { color: "#021521" },
        },
      },
    },
  });
}

function renderDeclines(items) {
  const top = (items || []).slice(0, 8);
  if (charts.declines) charts.declines.destroy();
  charts.declines = new Chart(document.getElementById("chart-declines"), {
    type: "bar",
    data: {
      labels: top.map((i) => i.label),
      datasets: [
        {
          data: top.map((i) => i.count),
          backgroundColor: ["#D7282F", "#005F98", "#F5D600", "#132550", "#69788b", "#9FE5FA", "#006098", "#ea575d"],
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
          ticks: { color: "#021521" },
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
  renderMix("chart-wallet", "legend-wallet", period.wallet_mix || [], "wallet");
  renderAuthByEntry(period.auth_rate_by_entry || []);
  renderDeclines(period.decline_reasons || []);
  resizeChartsSoon();
}

async function loadDashboard() {
  try {
    const res = await fetch("data/dashboard.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load dashboard.json (${res.status})`);
    dashboardData = await res.json();
    document.getElementById("scope-line").textContent =
      dashboardData.meta?.scope || "Company owned shops only";
    populatePeriodSelect(dashboardData);
    const periodId = document.getElementById("period-select").value;
    window.__dashboardState = { data: dashboardData, periodId };
    renderPeriod(dashboardData, periodId);
  } catch (err) {
    const page = document.querySelector(".page");
    const box = document.createElement("div");
    box.className = "error";
    box.textContent = `Dashboard failed to load: ${err.message}`;
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
