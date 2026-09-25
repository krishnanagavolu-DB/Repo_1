/* Payment Devices: Verifone e285 lifecycle burndown from certified JSON. */

(function () {
const DATA_URL = "data/payment_devices.json";
const NAVY = "#154167";
const MUTED = "#9aa8b5";
const BLACK = "#111111";
const BLUE = "#006098";
const RED = "#d9272d";

const RUN_RATE_MIN = 0.5;
const RUN_RATE_MAX = 10;
const RUN_RATE_STEP = 0.5;
const DAY_MS = 86400000;

let burndownChart = null;
let runRate = null;

function fmtInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month) return String(iso);
  const date = new Date(year, month - 1, day || 1);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(value) {
  const date = typeof value === "number" ? new Date(value) : null;
  if (date) {
    return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }
  const [year, month] = String(value).slice(0, 10).split("-").map(Number);
  if (!year || !month) return value;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function toMs(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month) return NaN;
  return new Date(year, month - 1, day || 1).getTime();
}

/* Real timestamps, not category indexes: the firm line is daily history and the
   projection is weekly, so an index axis would stretch 2026 and squash 2028. */
function pointsFor(series) {
  return (series || []).map((point) => ({ x: toMs(point.date), y: point.inventory }));
}

function fmtRate(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(1);
}

function shopsPerYear(value) {
  return Math.round(clampRunRate(value) * 52);
}

function clampRunRate(value, fallback = 5.5) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const snapped = Math.round(n / RUN_RATE_STEP) * RUN_RATE_STEP;
  return Math.min(RUN_RATE_MAX, Math.max(RUN_RATE_MIN, Number(snapped.toFixed(1))));
}

function addDays(iso, days) {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  const next = new Date(year, month - 1, (day || 1) + days);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-${dd}`;
}

function dayCount(fromIso, toIso) {
  return Math.round((toMs(toIso) - toMs(fromIso)) / DAY_MS);
}

/* Committed pending orders are fixed; only the open-ended tail after the PO
   pipeline responds to the run-rate control, so the slider never rewrites
   demand that is already booked. */
function projectSeries(payload, shopsPerWeek) {
  const projected = payload?.series?.projected || [];
  const devicesPerShop = Number(payload?.assumptions?.devices_per_shop) || 10;
  const pipelineEnd = payload?.summary?.pipeline_end_date || projected.at(-1)?.date;
  const thresholds = payload?.thresholds || [];
  const head = projected
    .filter((point) => String(point.date) <= String(pipelineEnd))
    .map((point) => ({ date: point.date, inventory: Number(point.inventory) }));
  const pipelinePoints = head.length
    ? head
    : projected.map((p) => ({ date: p.date, inventory: Number(p.inventory) }));
  const demandPoints = pipelinePoints.length ? [{ ...pipelinePoints.at(-1) }] : [];

  const perDay = (devicesPerShop * clampRunRate(shopsPerWeek)) / 7;
  let remaining = pipelinePoints.at(-1)?.inventory ?? 0;
  let offset = 0;
  while (remaining > 0 && perDay > 0) {
    offset += 1;
    remaining = Math.max(0, remaining - perDay);
    if (remaining < 1e-9) remaining = 0;
    if (remaining === 0 || offset % 7 === 0) {
      demandPoints.push({ date: addDays(pipelineEnd, offset), inventory: remaining });
    }
  }

  const points = [...pipelinePoints, ...demandPoints.slice(1)];
  return {
    points,
    pipelinePoints,
    demandPoints,
    zeroDate: points.at(-1)?.date || null,
    crossings: crossingsFor(points, thresholds),
    shopsPerWeek: clampRunRate(shopsPerWeek),
  };
}

function depletionNote(projection) {
  return `Pool depleted ${fmtDate(projection.zeroDate)} at ${fmtInt(
    shopsPerYear(projection.shopsPerWeek)
  )} shops/year`;
}

function crossingsFor(points, thresholds) {
  const rows = [];
  for (const threshold of thresholds) {
    const when = crossingDate(points, threshold);
    if (when) rows.push({ threshold, date: when, label: monthLabel(when) });
  }
  return rows;
}

function crossingDate(points, threshold) {
  if (!points.length) return null;
  if (points[0].inventory <= threshold) return points[0].date;
  for (let i = 0; i < points.length - 1; i += 1) {
    const from = points[i];
    const to = points[i + 1];
    if (from.inventory > threshold && threshold >= to.inventory) {
      if (from.inventory === to.inventory) return to.date;
      const frac = (from.inventory - threshold) / (from.inventory - to.inventory);
      const span = dayCount(from.date, to.date);
      return addDays(from.date, Math.floor(span * frac));
    }
  }
  return null;
}

function tickStepMonths(minMs, maxMs) {
  const months = (maxMs - minMs) / (DAY_MS * 30.44);
  if (months <= 30) return 3;
  if (months <= 60) return 6;
  return 12;
}

function monthTicks(minMs, maxMs, stepMonths) {
  const start = new Date(minMs);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const ticks = [];
  while (cursor.getTime() <= maxMs) {
    if (cursor.getTime() >= minMs) ticks.push(cursor.getTime());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + stepMonths, 1);
  }
  return ticks;
}

function showEmpty(options) {
  const empty = document.getElementById("devices-empty");
  const content = document.getElementById("devices-content");
  if (!empty || !content) return;
  empty.hidden = false;
  content.hidden = true;
  if (window.__notices?.renderNotice) window.__notices.renderNotice(empty, options);
  else empty.innerHTML = `<h3>${options.title}</h3><p>${options.body || ""}</p>`;
}

function showContent() {
  const empty = document.getElementById("devices-empty");
  const content = document.getElementById("devices-content");
  if (!empty || !content) return;
  empty.hidden = true;
  content.hidden = false;
}

const thresholdPlugin = {
  id: "deviceThresholds",
  afterDraw(chart, _args, options) {
    const crossings = options?.crossings || [];
    const thresholds = options?.thresholds || [];
    const gap = options?.gap || null;
    const yScale = chart.scales.y;
    const xScale = chart.scales.x;
    const { ctx, chartArea } = chart;
    if (!yScale || !xScale || !chartArea) return;

    ctx.save();
    ctx.font = "600 11px futura-pt, Arial, sans-serif";
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 1;

    for (const threshold of thresholds) {
      const y = yScale.getPixelForValue(threshold);
      if (y < chartArea.top || y > chartArea.bottom) continue;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      // Right edge keeps these clear of the y-axis tick labels.
      ctx.textAlign = "right";
      ctx.fillStyle = MUTED;
      ctx.fillText(fmtInt(threshold), chartArea.right - 6, y - 5);
    }

    for (const crossing of crossings) {
      const x = xScale.getPixelForValue(toMs(crossing.date));
      if (!Number.isFinite(x) || x < chartArea.left || x > chartArea.right) continue;
      const y = yScale.getPixelForValue(crossing.threshold);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = RED;
      ctx.fill();
      // Vertical labels sit inside the plot, so they never collide with the
      // month ticks on the axis below.
      ctx.save();
      ctx.translate(x - 4, chartArea.bottom - 8);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "left";
      ctx.fillStyle = NAVY;
      ctx.fillText(crossing.label || monthLabel(crossing.date), 0, 0);
      ctx.restore();
    }

    if (gap?.date) {
      const x = xScale.getPixelForValue(toMs(gap.date));
      if (Number.isFinite(x)) {
        ctx.strokeStyle = RED;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      }
    }
    ctx.restore();
    // Positioned here rather than after new Chart(): only once a draw has run
    // are the scales and chartArea final, and this also survives a resize.
    positionCallout(chart, gap);
  },
};

if (typeof Chart !== "undefined" && Chart.register) Chart.register(thresholdPlugin);

function setCalloutText(payload) {
  const box = document.getElementById("devices-gap-callout");
  if (!box) return;
  if (!payload.gap) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.textContent = `⚠️ ${payload.gap.label}`;
}

function positionCallout(chart, gap) {
  const box = document.getElementById("devices-gap-callout");
  const wrap = document.querySelector(".devices-chart-wrap");
  if (!box || !wrap || !gap?.date || box.hidden) return;
  const { chartArea } = chart;
  const x = chart.scales.x.getPixelForValue(toMs(gap.date));
  const y = chart.scales.y.getPixelForValue(gap.inventory);
  if (!chartArea || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const width = box.offsetWidth || 260;
  const height = box.offsetHeight || 56;
  const maxLeft = Math.max(8, wrap.clientWidth - width - 8);
  // Above the divergence point, but never over the legend sitting above chartArea.
  const top = Math.max(y - height - 12, chartArea.top + 6);
  box.style.left = `${Math.min(Math.max(x + 12, 8), maxLeft)}px`;
  box.style.top = `${Math.min(top, Math.max(8, wrap.clientHeight - height - 8))}px`;
}

function renderChart(payload, shopsPerWeek) {
  const canvas = document.getElementById("chart-devices-burndown");
  if (!canvas || typeof Chart === "undefined") return;
  const rate = clampRunRate(shopsPerWeek ?? payload.assumptions?.shops_per_week);
  const projection = projectSeries(payload, rate);
  const firmData = pointsFor(payload.series?.firm);
  const pipelineData = pointsFor(projection.pipelinePoints);
  const projectedData = pointsFor(projection.demandPoints);
  const yMax = Number(payload.chart?.y_max) || 6000;
  const xMin = toMs(payload.chart?.x_min || payload.series?.firm?.[0]?.date);
  // The tail moves with the run rate, so the axis follows the longer of the
  // certified window and the modelled depletion.
  const xMax = Math.max(
    toMs(payload.chart?.x_max || projection.zeroDate),
    toMs(projection.zeroDate || payload.chart?.x_max)
  );

  if (burndownChart) burndownChart.destroy();
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Verifone Balance",
          data: firmData,
          borderColor: BLACK,
          backgroundColor: BLACK,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
        },
        {
          label: "Order in Pipeline",
          data: pipelineData,
          borderColor: BLUE,
          backgroundColor: BLUE,
          borderWidth: 2,
          borderDash: [8, 4, 2, 4],
          pointRadius: 0,
          tension: 0,
        },
        {
          label: `Projected Demand (${fmtRate(rate)} Shops/Wk)`,
          data: projectedData,
          borderColor: RED,
          backgroundColor: RED,
          borderWidth: 2,
          borderDash: [],
          pointRadius: 0,
          tension: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      layout: { padding: { bottom: 18, top: 8 } },
      plugins: {
        legend: {
          position: "top",
          labels: { boxWidth: 18, font: { family: "futura-pt, Arial, sans-serif", weight: 700 } },
        },
        deviceThresholds: {
          thresholds: payload.thresholds || [3000, 2500, 2000, 1500, 1000],
          crossings: projection.crossings,
          gap: payload.gap || null,
        },
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          afterBuildTicks(axis) {
            // A slow run rate can push depletion years out; widen the step so
            // the axis never turns into a wall of overlapping labels.
            axis.ticks = monthTicks(axis.min, axis.max, tickStepMonths(axis.min, axis.max)).map(
              (value) => ({ value })
            );
          },
          ticks: {
            maxRotation: 0,
            autoSkip: false,
            callback: (value) => monthLabel(value),
          },
          grid: { display: false },
        },
        y: {
          min: 0,
          max: yMax,
          title: { display: true, text: "Inventory units remaining" },
          ticks: { callback: (value) => fmtInt(value) },
        },
      },
    },
  });
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderRibbon(payload, projection) {
  const summary = payload.summary || {};
  setText("devices-kpi-firm-value", `${fmtInt(summary.firm_inventory)}`);
  setText(
    "devices-kpi-firm-note",
    `${fmtInt(summary.baseline_inventory)} contracted − ${fmtInt(summary.shipped_qty)} shipped − ${fmtInt(summary.booked_qty)} booked`
  );
  setText("devices-kpi-pending-value", `${fmtInt(summary.pending_shops)} shops`);
  setText(
    "devices-kpi-pending-note",
    `${fmtInt(summary.pending_units)} units in the PO pipeline awaiting MIDs/booking`
  );
  setText("devices-kpi-shipped-value", `${fmtInt(summary.shipped_qty)}`);
  setText(
    "devices-kpi-shipped-note",
    `${fmtInt(summary.shipped_shops)} shops shipped since ${fmtDate(payload.assumptions?.baseline_date)}`
  );
  setText("devices-kpi-zero-value", monthLabel(projection.zeroDate));
  setText("devices-kpi-zero-note", depletionNote(projection));
}

function renderAssumptions(payload) {
  const grid = document.getElementById("devices-assumptions");
  if (!grid) return;
  const a = payload.assumptions || {};
  const cards = [
    {
      title: "Master Contract",
      value: `${fmtInt(a.baseline_inventory)} Units`,
      note: `${fmtDate(a.baseline_date)} baseline, covers all entity types.`,
    },
    {
      title: "Shop Allocation",
      value: `${fmtInt(a.devices_per_shop)} Units/Shop`,
      note: `Assumed shipped ${fmtInt(a.staging_lead_days)} days pre-opening.`,
    },
    {
      title: "Safety Buffer",
      value: `${fmtInt(a.safety_buffer)} Units`,
      note: "Reserved for field service / break-fix.",
    },
    {
      title: "e235 Cutover Target",
      value: `${fmtInt(a.order_threshold)} Units`,
      note: "Remaining e285 balance that triggers the next hardware order.",
    },
    {
      title: "Scope",
      value: "Whole network",
      note: "Company-owned and franchise/Boersma shops draw from one pool.",
    },
    {
      title: "Depot / Spare Stock",
      value: "Not modelled",
      note: "Depot stock is excluded; consider reserving 500 devices for depot and spares.",
    },
  ];
  grid.innerHTML = cards
    .map(
      (card) => `
      <div class="devices-assumption">
        <div class="devices-assumption-title">${card.title}</div>
        <div class="devices-assumption-value">${card.value}</div>
        <p class="devices-assumption-note">${card.note}</p>
      </div>`
    )
    .join("");
}

function renderRunRateControl(rate) {
  const slider = document.getElementById("devices-runrate");
  if (slider && Number(slider.value) !== rate) slider.value = String(rate);
  setText("devices-runrate-value", `${fmtRate(rate)} Shops/Wk`);
}

function applyRunRate(nextRate, payload) {
  const data = payload || window.__paymentDevicesState;
  if (!data?.certified) return;
  runRate = clampRunRate(nextRate, clampRunRate(data.assumptions?.shops_per_week));
  const projection = projectSeries(data, runRate);
  renderRunRateControl(runRate);
  renderRibbon(data, projection);
  renderChart(data, runRate);
}

function bindRunRateControl(payload) {
  const slider = document.getElementById("devices-runrate");
  const down = document.getElementById("devices-runrate-down");
  const up = document.getElementById("devices-runrate-up");
  if (slider && !slider.dataset.bound) {
    slider.dataset.bound = "true";
    slider.addEventListener("input", () => applyRunRate(slider.value, payload));
  }
  if (down && !down.dataset.bound) {
    down.dataset.bound = "true";
    down.addEventListener("click", () => applyRunRate(runRate - RUN_RATE_STEP, payload));
  }
  if (up && !up.dataset.bound) {
    up.dataset.bound = "true";
    up.addEventListener("click", () => applyRunRate(runRate + RUN_RATE_STEP, payload));
  }
}

function registerSnapshot(payload) {
  const asOf = payload.summary?.as_of;
  const label = payload.certified ? `As of ${fmtDate(asOf)}` : "Awaiting sources";
  window.dispatchEvent(
    new CustomEvent("dashboard:periods", {
      detail: {
        tabId: "devices",
        periods: [{ id: asOf || "awaiting", label }],
      },
    })
  );
}

function renderDevices(payload) {
  if (!payload?.certified) {
    showEmpty({
      title: "Payment Devices is waiting on source files",
      body: (payload?.warnings || []).join(" ") || "Drop the PO extract and booked/shipped orders report into data/raw/payment-devices/ and rerun the importer.",
    });
    registerSnapshot(payload || {});
    return;
  }
  showContent();
  runRate = clampRunRate(payload.assumptions?.shops_per_week);
  renderAssumptions(payload);
  setCalloutText(payload);
  bindRunRateControl(payload);
  applyRunRate(runRate, payload);
  registerSnapshot(payload);
  const note = document.getElementById("devices-source-note");
  if (note && payload.sources) {
    note.textContent = `Sources: ${payload.sources.po_extract} · ${payload.sources.orders_report} · Kimlie’s bi-weekly stock status · item ${payload.assumptions?.target_item || "M087-500-14-WWA"}`;
  }
}

async function loadDevices() {
  try {
    const payload = await window.__dashboardAuth.loadJson(DATA_URL);
    window.__paymentDevicesState = payload;
    renderDevices(payload);
  } catch (error) {
    const waiting = Number(error?.status) === 404;
    showEmpty({
      title: waiting ? "Payment Devices is waiting on source files" : "Payment Devices could not load",
      body: waiting
        ? "Drop PO_Extract_*.xlsx and Daily Dutch Bros Booked Shipped Orders Report*.xlsx into data/raw/payment-devices/ and rerun scripts/import_payment_devices.py. Shipped shops win over booked shops on the 6-character shop id."
        : error?.message || "The encrypted payload is missing or could not be opened.",
    });
  }
}

function startWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    loadDevices();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => loadDevices(), { once: true });
}

window.__paymentDevices = {
  fmtInt,
  fmtRate,
  shopsPerYear,
  depletionNote,
  toMs,
  addDays,
  pointsFor,
  monthTicks,
  tickStepMonths,
  monthLabel,
  clampRunRate,
  projectSeries,
  crossingsFor,
  renderDevices,
  renderChart,
  applyRunRate,
  loadDevices,
};

document.addEventListener("DOMContentLoaded", startWhenUnlocked);
})();
