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
  authTrend: null,
  declineMix: null,
  declinesTime: null,
};

/* The slide leads with the two numbers leadership acts on; everything else in
   the priority order sits beneath them. See docs/ops/metric-priority.md. */
const HERO_KEYS = ["auth_rate", "sales_volume"];
const AUX_KEYS = [
  "decline_volume",
  "downgrade_rate",
  "ic_fee",
  "ic_rate",
  "transaction_volume",
  "aov",
  "returns_pct_of_sales",
];

const DECLINE_COLORS = ["#D9272D", "#006098", "#154167", "#4094A7", "#E99F41", "#D2DCE5"];

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

/** Worldpay reason codes run long; axis and legend text is clipped, not the data. */
function shortLabel(text, max = 24) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/** Generic "Decline" is preserved in totals/donut but hides useful reason codes in a ranking. */
function actionableDeclines(items) {
  return (items || [])
    .filter((item) => String(item?.label || "").trim().toLowerCase() !== "decline")
    .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0));
}

window.__dashboardFormat = {
  mixPct,
  signed,
  money,
  compactMoney,
  compactCount,
  deltaDisplay,
  mixLabel,
  actionableDeclines,
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

function metaFor(key) {
  return KPI_ORDER.find((item) => item.key === key);
}

function renderKpis(period) {
  const hero = document.getElementById("hero-kpis");
  const aux = document.getElementById("aux-kpis");
  if (!hero || !aux) return;

  hero.innerHTML = HERO_KEYS.map((key) => {
    const meta = metaFor(key);
    const kpi = period.kpis?.[key];
    if (!meta || !kpi) return "";
    const delta = deltaDisplay(meta, kpi);
    const subValue = meta.subValue ? meta.subValue(period) : "";
    return `
      <div class="hero-kpi" title="${meta.why || ""}">
        <div class="hero-value">${meta.format(kpi.value)}</div>
        <div class="hero-delta ${delta.className}">${delta.text}</div>
        <div class="hero-label">${meta.label}</div>
        ${subValue ? `<div class="hero-sub">${subValue}</div>` : ""}
      </div>`;
  }).join("");

  aux.innerHTML = AUX_KEYS.map((key) => {
    const meta = metaFor(key);
    const kpi = period.kpis?.[key];
    if (!meta || !kpi) return "";
    const delta = deltaDisplay(meta, kpi);
    return `
      <div class="aux-kpi" title="${meta.why || ""}">
        <span class="aux-label">${meta.label}</span>
        <span class="aux-figure">
          <span class="aux-value">${meta.format(kpi.value)}</span>
          <span class="aux-delta ${delta.className}">${delta.text}</span>
        </span>
      </div>`;
  }).join("");

  renderBenchmarkStrip(period);
}

/** Context line: how the week sits against published industry reference rates. */
function renderBenchmarkStrip(period) {
  const strip = document.getElementById("bench-strip");
  if (!strip) return;
  const authRate = Number(period?.kpis?.auth_rate?.value);
  if (!benchmarkRefs.length || !Number.isFinite(authRate)) {
    strip.innerHTML = "";
    return;
  }
  strip.innerHTML = benchmarkRefs
    .map((item) => {
      const gapPts = (authRate - item.value) * 100;
      const tone = gapPts >= 0 ? "up" : "down";
      return `
        <div class="bench-row" title="${item.segment || ""} — directional context, not a target">
          <span class="bench-label">${item.label} · ${(item.value * 100).toFixed(1)}%</span>
          <span class="bench-gap ${tone}">${signed(gapPts, 1)} pts</span>
        </div>`;
    })
    .join("");
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
        inlineValueLabels: {
          display: true,
          formatter: (value) => `${Number(value).toFixed(1)}%`,
        },
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
          valueFormatter: (value) => `${Number(value).toFixed(1)}%`,
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
        inlineValueLabels: { display: true },
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
            color: "#5a6f82",
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
  const top = actionableDeclines(items).slice(0, 7);
  if (charts.declines) charts.declines.destroy();
  if (!top.length) {
    charts.declines = null;
    return;
  }
  charts.declines = new Chart(canvas, {
    type: "bar",
    data: {
      labels: top.map((i) => shortLabel(i.label, 22)),
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
      plugins: {
        legend: { display: false },
        inlineValueLabels: {
          display: true,
          formatter: (value) => window.__chartLabels?.compactCount(value),
        },
        tooltip: {
          callbacks: {
            title: (items) => top[items[0]?.dataIndex]?.label || "",
            label: (ctx) => Number(ctx.raw).toLocaleString("en-US"),
          },
        },
      },
      scales: {
        x: {
          grid: { color: "#eef2f6" },
          ticks: { color: "#5a6f82", font: { size: 10 }, callback: (v) => compactCount(v) },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#154167", font: { size: 10 }, autoSkip: false },
        },
      },
    },
  });
}

/* Published benchmarks are directional context only, so they render as dashed
   reference lines and never as a target the dashboard scores against. */
let benchmarkRefs = [];
let trendCategory = "all";

async function loadBenchmarkRefs() {
  try {
    let data = window.__benchmarkData;
    if (!data) {
      const res = await fetch("data/benchmarks.json", { cache: "no-store" });
      if (!res.ok) return;
      data = await res.json();
      window.__benchmarkData = data;
    }
    benchmarkRefs = (data.payment_benchmarks || [])
      .filter(
        (item) =>
          /approval rate|authorization rate/i.test(item.metric) && !/decline/i.test(item.metric)
      )
      .map((item) => ({
        label: item.metric,
        segment: item.segment,
        value: Number(item.value ?? item.range_low),
      }))
      .filter((item) => Number.isFinite(item.value))
      .slice(0, 2);
  } catch (err) {
    benchmarkRefs = [];
  }
}

function shortWeekLabel(week) {
  return String(week?.label || week?.id || "").split("–")[0].trim();
}

function authSeriesFor(weeks, category) {
  if (category === "all") {
    return weeks.map((week) => {
      const value = Number(week?.kpis?.auth_rate?.value);
      return Number.isFinite(value) ? value * 100 : null;
    });
  }
  return weeks.map((week) => {
    const row = (week.auth_rate_by_entry || []).find((entry) => entry.label === category);
    const value = Number(row?.auth_rate);
    return Number.isFinite(value) ? value * 100 : null;
  });
}

function renderTrendCategories(data) {
  const rail = document.getElementById("trend-categories");
  if (!rail) return;
  const weeks = data?.periods?.weeks || [];
  const latest = weeks[weeks.length - 1];
  const categories = ["all", ...(latest?.auth_rate_by_entry || []).map((entry) => entry.label)];
  if (!categories.includes(trendCategory)) trendCategory = "all";

  rail.innerHTML = categories
    .map(
      (category) =>
        `<button type="button" class="cat-btn${
          category === trendCategory ? " active" : ""
        }" data-category="${category}">${
          category === "all" ? "All card present" : category
        }</button>`
    )
    .join("");

  rail.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      trendCategory = button.dataset.category;
      renderTrendCategories(data);
      renderAuthTrend(data);
    });
  });
}

function renderAuthTrend(data) {
  const canvas = document.getElementById("chart-auth-trend");
  if (!canvas) return;
  const weeks = data?.periods?.weeks || [];
  if (charts.authTrend) charts.authTrend.destroy();
  if (!weeks.length) {
    charts.authTrend = null;
    return;
  }

  const values = authSeriesFor(weeks, trendCategory);
  const selectedId = window.__dashboardState?.periodId;
  const benchmarkValues = benchmarkRefs.map((item) => item.value * 100);
  const plotted = values.filter((value) => Number.isFinite(value));
  const floor = Math.min(...plotted, ...benchmarkValues);

  charts.authTrend = new Chart(canvas, {
    type: "line",
    data: {
      labels: weeks.map(shortWeekLabel),
      datasets: [
        {
          label: trendCategory === "all" ? "All card present" : trendCategory,
          data: values,
          valueFormatter: (value) => `${Number(value).toFixed(2)}%`,
          borderColor: "#006098",
          backgroundColor: "rgba(0, 96, 152, 0.10)",
          borderWidth: 3,
          pointRadius: weeks.map((week) => (week.id === selectedId ? 6 : 3)),
          pointBackgroundColor: weeks.map((week) =>
            week.id === selectedId ? "#D9272D" : "#006098"
          ),
          fill: true,
          tension: 0.3,
        },
        ...benchmarkRefs.map((item, idx) => ({
          label: `${item.label} · ${(item.value * 100).toFixed(1)}%`,
          data: weeks.map(() => item.value * 100),
          inlineLabels: false,
          borderColor: idx === 0 ? "#4094A7" : "#E99F41",
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 0,
          fill: false,
        })),
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
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
            label: (ctx) =>
              `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)}%`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#5a6f82", font: { size: 10 } } },
        y: {
          suggestedMin: Math.max(0, Math.floor(floor - 1)),
          suggestedMax: 100,
          grid: { color: "#eef2f6" },
          ticks: {
            color: "#5a6f82",
            font: { size: 10 },
            maxTicksLimit: 6,
            callback: (value) => `${value}%`,
          },
        },
      },
    },
  });
}

/** Top reasons plus a rolled-up Other, so the donut stays readable. */
function topDeclineReasons(items, limit = 5) {
  const rows = (items || [])
    .map((item) => ({ label: item.label, count: Number(item.count) || 0 }))
    .sort((a, b) => b.count - a.count);
  const top = rows.slice(0, limit);
  const rest = rows.slice(limit);
  if (rest.length) {
    top.push({ label: "Other reasons", count: rest.reduce((sum, i) => sum + i.count, 0) });
  }
  return top;
}

function renderDeclineMix(period) {
  const canvas = document.getElementById("chart-decline-mix");
  if (!canvas) return;
  const rows = topDeclineReasons(period.decline_reasons || []);
  if (charts.declineMix) charts.declineMix.destroy();
  if (!rows.length) {
    charts.declineMix = null;
    return;
  }
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  charts.declineMix = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: rows.map((row) => {
        const share = total ? row.count / total : 0;
        return `${shortLabel(row.label, 16)} · ${mixPct(share)}`;
      }),
      datasets: [
        {
          data: rows.map((row) => row.count),
          valueFormatter: (value) => {
            const count = Number(value) || 0;
            const share = total ? count / total : 0;
            return share >= 0.06 ? `${(share * 100).toFixed(0)}%` : "";
          },
          backgroundColor: rows.map((_, idx) => DECLINE_COLORS[idx % DECLINE_COLORS.length]),
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
        legend: {
          position: "right",
          labels: { boxWidth: 10, font: { size: 10 }, color: "#154167" },
        },
        tooltip: {
          callbacks: {
            title: (items) => rows[items[0]?.dataIndex]?.label || "",
            label: (ctx) => {
              const count = Number(ctx.raw) || 0;
              const share = total ? mixPct(count / total) : "0.0%";
              return `${count.toLocaleString("en-US")} (${share})`;
            },
          },
        },
      },
    },
  });
}

function renderDeclinesOverTime(data) {
  const canvas = document.getElementById("chart-declines-time");
  if (!canvas) return;
  const weeks = data?.periods?.weeks || [];
  if (charts.declinesTime) charts.declinesTime.destroy();
  if (!weeks.length) {
    charts.declinesTime = null;
    return;
  }

  const totals = new Map();
  for (const week of weeks) {
    for (const reason of week.decline_reasons || []) {
      totals.set(reason.label, (totals.get(reason.label) || 0) + (Number(reason.count) || 0));
    }
  }
  const topLabels = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([label]) => label);

  const stacked = topLabels.map((label, idx) => ({
    type: "bar",
    label,
    data: weeks.map((week) => {
      const row = (week.decline_reasons || []).find((item) => item.label === label);
      return Number(row?.count) || 0;
    }),
    backgroundColor: DECLINE_COLORS[idx % DECLINE_COLORS.length],
    stack: "reasons",
    yAxisID: "y",
  }));

  stacked.push({
    type: "bar",
    label: "Other reasons",
    data: weeks.map((week) => {
      return (week.decline_reasons || [])
        .filter((item) => !topLabels.includes(item.label))
        .reduce((sum, item) => sum + (Number(item.count) || 0), 0);
    }),
    backgroundColor: "#D2DCE5",
    stack: "reasons",
    yAxisID: "y",
  });

  const requestTotals = weeks.map((week) =>
    (week.decline_reasons || []).reduce((sum, item) => sum + (Number(item.count) || 0), 0)
  );

  charts.declinesTime = new Chart(canvas, {
    data: {
      labels: weeks.map(shortWeekLabel),
      datasets: [
        ...stacked.map((dataset) => ({ ...dataset, inlineLabels: false })),
        {
          type: "line",
          label: "Total decline requests",
          data: requestTotals,
          borderColor: "transparent",
          backgroundColor: "transparent",
          pointRadius: 0,
          pointHoverRadius: 0,
          inlineLabels: true,
          valueFormatter: (value) => window.__chartLabels?.compactCount(value),
          labelOffset: 8,
          yAxisID: "y",
        },
        {
          type: "line",
          label: "Decline $",
          data: weeks.map((week) => Number(week?.totals?.decline_amt) || 0),
          valueFormatter: (value) => window.__chartLabels?.compactMoney(value),
          labelOffset: 21,
          borderColor: "#154167",
          backgroundColor: "transparent",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        inlineValueLabels: { display: true },
        legend: {
          position: "top",
          align: "start",
          labels: {
            boxWidth: 10,
            font: { size: 10 },
            color: "#154167",
            filter: (item) => item.text !== "Total decline requests",
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              ctx.dataset.yAxisID === "y1"
                ? `${ctx.dataset.label}: ${compactMoney(ctx.raw)}`
                : `${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("en-US")}`,
          },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: "#5a6f82", font: { size: 10 } } },
        y: {
          stacked: true,
          grid: { color: "#eef2f6" },
          ticks: { color: "#5a6f82", font: { size: 10 }, callback: (v) => compactCount(v) },
        },
        y1: {
          position: "right",
          grid: { display: false },
          ticks: { color: "#154167", font: { size: 10 }, callback: (v) => compactMoney(v) },
        },
      },
    },
  });
}

function renderPeriod(data, periodId) {
  const period = getPeriod(data, periodId);
  if (!period) return;
  window.__dashboardState = { data, periodId };
  const slideLabel = document.getElementById("slide-period");
  if (slideLabel) slideLabel.textContent = period.label || "";
  renderKpis(period);
  renderTrendCategories(data);
  renderAuthTrend(data);
  renderDeclineMix(period);
  renderDeclinesOverTime(data);
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
    await loadBenchmarkRefs();
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
