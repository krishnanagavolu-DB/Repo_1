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

function monthLabel(iso) {
  const [year, month] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month) return iso;
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function uniqueDates(payload) {
  const dates = new Set();
  for (const point of payload.series?.firm || []) dates.add(point.date);
  for (const point of payload.series?.projected || []) dates.add(point.date);
  for (const crossing of payload.crossings || []) dates.add(String(crossing.date).slice(0, 10));
  if (payload.gap?.date) dates.add(String(payload.gap.date).slice(0, 10));
  return [...dates].sort();
}

function seriesOnLabels(points, labels) {
  const byDate = new Map((points || []).map((point) => [point.date, point.inventory]));
  let last = null;
  return labels.map((label) => {
    if (byDate.has(label)) last = byDate.get(label);
    return last;
  });
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
    ctx.fillStyle = MUTED;
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
      ctx.fillText(fmtInt(threshold), chartArea.left + 6, y - 6);
    }

    const labels = chart.data.labels || [];
    function xForDate(iso) {
      const day = String(iso).slice(0, 10);
      let index = labels.indexOf(day);
      if (index < 0) index = labels.findIndex((label) => label >= day);
      return index < 0 ? null : xScale.getPixelForValue(index);
    }

    for (const crossing of crossings) {
      const x = xForDate(crossing.date);
      if (x == null) continue;
      const y = yScale.getPixelForValue(crossing.threshold);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.fillStyle = NAVY;
      ctx.fillText(crossing.label || monthLabel(crossing.date), x, Math.min(chartArea.bottom + 14, chart.height - 4));
    }

    if (gap?.date) {
      const x = xForDate(gap.date);
      if (x != null) {
        ctx.strokeStyle = RED;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};

if (typeof Chart !== "undefined" && Chart.register) Chart.register(thresholdPlugin);

function placeCallout(payload, chart) {
  const box = document.getElementById("devices-gap-callout");
  if (!box) return;
  const gap = payload.gap;
  if (!gap) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  box.textContent = `⚠️ ${gap.label}`;
  const wrap = document.querySelector(".devices-chart-wrap");
  if (!wrap || !chart?.chartArea) return;
  const labels = chart.data.labels || [];
  const iso = String(gap.date).slice(0, 10);
  let index = labels.indexOf(iso);
  if (index < 0) index = labels.findIndex((label) => label >= iso);
  if (index < 0) return;
  const x = chart.scales.x.getPixelForValue(index);
  const y = chart.scales.y.getPixelForValue(gap.inventory);
  box.style.left = `${Math.min(Math.max(x - 40, 12), wrap.clientWidth - 280)}px`;
  box.style.top = `${Math.max(y - 72, 12)}px`;
}

function renderChart(payload) {
  const canvas = document.getElementById("chart-devices-burndown");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = uniqueDates(payload);
  const firmPoints = payload.series?.firm || [];
  const projectedPoints = payload.series?.projected || [];
  const firmEnd = firmPoints.at(-1)?.date;
  const firmData = seriesOnLabels(firmPoints, labels).map((value, index) => {
    if (!firmEnd) return value;
    return labels[index] > firmEnd ? null : value;
  });
  const projectedData = seriesOnLabels(projectedPoints, labels).map((value, index) => {
    if (!firmEnd) return value;
    return labels[index] < firmEnd ? null : value;
  });
  const yMax = Number(payload.chart?.y_max) || 6000;

  if (burndownChart) burndownChart.destroy();
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Actual/Booked Inventory (Verifone Firm Balance)",
          data: firmData,
          borderColor: BLACK,
          backgroundColor: BLACK,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
        {
          label: "Projected Demand (Pending Orders + 5.5 Shops/Wk)",
          data: projectedData,
          borderColor: RED,
          backgroundColor: RED,
          borderWidth: 2,
          borderDash: [7, 5],
          pointRadius: 0,
          tension: 0.15,
          spanGaps: false,
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
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
            callback(value) {
              return monthLabel(this.getLabelForValue(value));
            },
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
  placeCallout(payload, burndownChart);
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
  uniqueDates,
  seriesOnLabels,
  renderDevices,
  renderChart,
  loadDevices,
};

document.addEventListener("DOMContentLoaded", startWhenUnlocked);
})();
