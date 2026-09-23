/* Payment Devices: Verifone e285 inventory burndown from certified JSON. */

(function () {
const DATA_URL = "data/payment_devices.json";
const NAVY = "#154167";
const BLUE = "#006098";
const MUTED = "#9aa8b5";

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
  for (const point of payload.series?.pipeline || []) dates.add(point.date);
  for (const point of payload.series?.runRate || []) dates.add(point.date);
  for (const crossing of payload.crossings || []) dates.add(String(crossing.date).slice(0, 10));
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
    for (const crossing of crossings) {
      const iso = String(crossing.date).slice(0, 10);
      let index = labels.indexOf(iso);
      if (index < 0) {
        index = labels.findIndex((label) => label >= iso);
      }
      if (index < 0) continue;
      const x = xScale.getPixelForValue(index);
      const y = yScale.getPixelForValue(crossing.threshold);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.textAlign = "center";
      ctx.fillStyle = NAVY;
      ctx.fillText(crossing.label || monthLabel(iso), x, Math.min(chartArea.bottom + 14, chart.height - 4));
    }
    ctx.restore();
  },
};

if (typeof Chart !== "undefined" && Chart.register) Chart.register(thresholdPlugin);

function renderChart(payload) {
  const canvas = document.getElementById("chart-devices-burndown");
  if (!canvas || typeof Chart === "undefined") return;
  const labels = uniqueDates(payload);
  const pipelinePoints = payload.series?.pipeline || [];
  const runPoints = payload.series?.runRate || [];
  const pipelineEnd = pipelinePoints.at(-1)?.date;
  const pipelineData = seriesOnLabels(pipelinePoints, labels).map((value, index) => {
    if (!pipelineEnd) return value;
    return labels[index] > pipelineEnd ? null : value;
  });
  const runData = seriesOnLabels(runPoints, labels).map((value, index) => {
    if (!pipelineEnd) return value;
    return labels[index] < pipelineEnd ? null : value;
  });
  const start = Number(payload.summary?.starting_inventory) || 0;
  const yMax = Math.max(4000, Math.ceil(start / 500) * 500);

  if (burndownChart) burndownChart.destroy();
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Projected Opening Pipeline",
          data: pipelineData,
          borderColor: BLUE,
          backgroundColor: BLUE,
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
          spanGaps: false,
        },
        {
          label: "Projected Run-Rate (5.5 Shops/Wk)",
          data: runData,
          borderColor: BLUE,
          backgroundColor: BLUE,
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
      plugins: {
        legend: {
          position: "top",
          labels: { boxWidth: 18, font: { family: "futura-pt, Arial, sans-serif", weight: 700 } },
        },
        deviceThresholds: {
          thresholds: payload.thresholds || [3000, 2500, 2000, 1500, 1000],
          crossings: payload.crossings || [],
        },
      },
      scales: {
        x: {
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10,
            callback(value) {
              const label = this.getLabelForValue(value);
              return monthLabel(label);
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
}

function renderSummary(payload) {
  const live = document.getElementById("devices-live");
  const assumptions = document.getElementById("devices-assumptions");
  const summary = payload.summary || {};
  const a = payload.assumptions || {};
  if (live) {
    live.innerHTML = `
      <li><strong>Starting inventory</strong> ${fmtInt(summary.starting_inventory)} as of ${fmtDate(summary.as_of)}</li>
      <li><strong>Shops in the PO pipeline</strong> ${fmtInt(summary.po_pipeline_shops)}</li>
      <li><strong>Shops already shipped</strong> ${fmtInt(summary.shipped_shops)}</li>
      <li><strong>Remaining unfulfilled shops</strong> ${fmtInt(summary.unfulfilled_shops)}</li>
      <li><strong>Expected balance at end of PO pipeline</strong> ${fmtInt(summary.pipeline_end_inventory)} on ${fmtDate(summary.pipeline_end_date)}</li>
    `;
  }
  if (assumptions) {
    assumptions.innerHTML = `
      <li>${fmtInt(a.devices_per_shop)} Verifone e285 units per shop</li>
      <li>${a.shops_per_week} shops per week growth after the latest projected opening</li>
      <li>${fmtInt(a.safety_buffer)}-unit safety buffer</li>
      <li>${fmtInt(a.order_threshold)}-unit target threshold to place a new hardware order</li>
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
      body: (payload?.warnings || []).join(" ") || "Drop the vendor inventory text, PO extract, and orders report into data/raw/payment-devices/ and rerun the importer.",
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
    note.textContent = `Sources: ${payload.sources.vendor} · ${payload.sources.po_extract} · ${payload.sources.orders_report}`;
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
        ? "Drop the vendor inventory text, PO extract, and orders report into data/raw/payment-devices/ and rerun scripts/import_payment_devices.py. Matching is exact on the 6-character shop id."
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
