/* Payment Devices: Verifone e285 lifecycle burndown from certified JSON. */

(function () {
const DATA_URL = "data/payment_devices.json";
const NAVY = "#154167";
const MUTED = "#9aa8b5";
const BLACK = "#111111";
const RED = "#d9272d";

let burndownChart = null;

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

function renderChart(payload) {
  const canvas = document.getElementById("chart-devices-burndown");
  if (!canvas || typeof Chart === "undefined") return;
  const firmData = pointsFor(payload.series?.firm);
  const projectedData = pointsFor(payload.series?.projected);
  const yMax = Number(payload.chart?.y_max) || 6000;
  const xMin = toMs(payload.chart?.x_min || payload.series?.firm?.[0]?.date);
  const xMax = toMs(payload.chart?.x_max || payload.series?.projected?.at(-1)?.date);

  if (burndownChart) burndownChart.destroy();
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Actual/Booked Inventory (Verifone Firm Balance)",
          data: firmData,
          borderColor: BLACK,
          backgroundColor: BLACK,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
        },
        {
          label: "Projected Demand (Pending Orders + 5.5 Shops/Wk)",
          data: projectedData,
          borderColor: RED,
          backgroundColor: RED,
          borderWidth: 2,
          borderDash: [7, 5],
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
          crossings: payload.crossings || [],
          gap: payload.gap || null,
        },
      },
      scales: {
        x: {
          type: "linear",
          min: xMin,
          max: xMax,
          afterBuildTicks(axis) {
            axis.ticks = monthTicks(axis.min, axis.max, 3).map((value) => ({ value }));
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

function renderSummary(payload) {
  const live = document.getElementById("devices-live");
  const assumptions = document.getElementById("devices-assumptions");
  const summary = payload.summary || {};
  const a = payload.assumptions || {};
  if (live) {
    live.innerHTML = `
      <li><strong>Current firm inventory</strong> ${fmtInt(summary.firm_inventory)} = ${fmtInt(summary.baseline_inventory)} − ${fmtInt(summary.shipped_qty)} shipped since Feb − ${fmtInt(summary.booked_qty)} booked</li>
      <li><strong>Shops already shipped</strong> ${fmtInt(summary.shipped_shops)} since Feb 2026 (${fmtInt(summary.shipped_qty)} units)</li>
      <li><strong>Pending orders</strong> ${fmtInt(summary.pending_shops)} shops in the PO extract without a booked e285 order (${fmtInt(summary.pending_units)} units)</li>
    `;
  }
  if (assumptions) {
    assumptions.innerHTML = `
      <li>Baseline contract allocation: ${fmtInt(a.baseline_inventory)} units (${fmtDate(a.baseline_date)})</li>
      <li>Scope: ${a.scope || "Tracks total ecosystem hardware depletion (Company-Owned and Franchise/Boersma locations combined) against the 5,700-unit master contract"}</li>
      <li>Standard hardware allocation: ${fmtInt(a.devices_per_shop)} e285 units per shop</li>
      <li>Stratix staging lead time: devices ship ${fmtInt(a.staging_lead_days)} days before a shop’s projected opening</li>
      <li>Post-pipeline projection: ${a.shops_per_week} shop openings per week</li>
      <li>The ${fmtInt(a.safety_buffer)}-unit threshold is the safety buffer for field service and hardware support</li>
      <li>Target threshold to begin ordering e235 hardware is ${fmtInt(a.order_threshold)} remaining e285 units</li>
    `;
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
  renderSummary(payload);
  setCalloutText(payload);
  renderChart(payload);
  registerSnapshot(payload);
  const note = document.getElementById("devices-source-note");
  if (note && payload.sources) {
    note.textContent = `Sources: ${payload.sources.po_extract} · ${payload.sources.orders_report} · item ${payload.assumptions?.target_item || "M087-500-14-WWA"}`;
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
  toMs,
  pointsFor,
  monthTicks,
  monthLabel,
  renderDevices,
  renderChart,
  loadDevices,
};

document.addEventListener("DOMContentLoaded", startWhenUnlocked);
})();
