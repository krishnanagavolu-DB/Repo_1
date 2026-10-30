/* Payment device health on the executive overview: this week's openings, and the E285 contract. */

(function () {
const NSO_URL = "data/nso_health.json";
const DEVICES_URL = "data/payment_devices.json";
const HEALTH_URL = "data/device_health.json";
let nso = null;
let devicesPayload = null;
let terminalHealth = null;
let burndownChart = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
}

function currentDateLabel() {
  return new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDate(iso) {
  const [year, month, day] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!year || !month) return iso || "—";
  return new Date(year, month - 1, day || 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function toMs(iso) {
  const [year, month, day] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!year || !month) return NaN;
  return new Date(year, month - 1, day || 1).getTime();
}

function addDays(iso, days) {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  const next = new Date(year, month - 1, (day || 1) + days);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-${dd}`;
}

function weekEnd(weekStart) {
  return addDays(weekStart, 6);
}

function shopsForWeek(shops, weekStart) {
  if (!weekStart || weekStart === "history") return [];
  const end = weekEnd(weekStart);
  return (shops || []).filter((shop) => shop.opening_date >= weekStart && shop.opening_date <= end);
}

function isoDate(date) {
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/* Monday of the week that contains `today`. Sunday belongs to the week that
   started the previous Monday. */
function mondayOf(today) {
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const weekday = date.getDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setDate(date.getDate() + offset);
  return isoDate(date);
}

/* New shop openings look forward from this Monday through the Sunday three
   weeks later. Sales weeks stay on the period picker. */
function openingsAhead(shops, today = new Date()) {
  const start = mondayOf(today);
  const end = addDays(start, 20);
  const rows = (shops || [])
    .filter((shop) => shop.opening_date >= start && shop.opening_date <= end)
    .slice()
    .sort((a, b) => a.opening_date.localeCompare(b.opening_date) || String(a.id).localeCompare(String(b.id)));
  return { shops: rows, start, end };
}

function pill(value) {
  const tone = String(value || "").toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="health-pill health-${escapeHtml(tone)}">${escapeHtml(value || "—")}</span>`;
}

function renderTable() {
  const body = document.getElementById("nso-health-body");
  const empty = document.getElementById("nso-health-empty");
  const week = document.getElementById("nso-health-week");
  if (!body) return;
  const window = openingsAhead(nso?.shops);
  const rows = window.shops;
  if (week) {
    week.textContent = `Shops opening ${fmtDate(window.start)} – ${fmtDate(window.end)}`;
  }
  body.innerHTML = rows
    .map(
      (shop) => `<tr>
        <th scope="row">${escapeHtml(shop.id)} <span class="health-where">${escapeHtml([shop.city, shop.state].filter(Boolean).join(", "))}</span></th>
        <td>${escapeHtml(fmtDate(shop.opening_date))}</td>
        <td>${pill(shop.verifone_to_stratix)}</td>
        <td>${pill(shop.stratix_to_shop)}</td>
        <td>${escapeHtml(shop.first_tamper_check)}</td>
      </tr>`
    )
    .join("");
  if (empty) {
    empty.hidden = rows.length > 0;
    if (!rows.length) {
      empty.textContent = `No shops are projected to open ${fmtDate(window.start)} – ${fmtDate(window.end)}.`;
    }
  }
}

/* Total leads, then the two placed buckets side by side. Serials without a
   confirmed location stay out of the card; the definitions under Ask about
   this data explain why the two buckets do not sum to the total. */
function renderTerminals(health) {
  const host = document.getElementById("e285-health");
  const asof = document.getElementById("device-health-asof");
  if (!host || !health?.e285) return;
  if (asof) asof.textContent = `As of ${currentDateLabel()}`;
  const row = health.e285;
  host.innerHTML = `
    <p class="health-kicker">VHQ ${fmtDate(health.vhq_as_of)} · iTrac ${fmtDate(health.itrac_as_of)}</p>
    <dl class="e285-split">
      <div class="e285-total"><dt>Total terminals</dt><dd>${fmtInt(row.total)}<span>Every E285 across VHQ and iTrac</span></dd></div>
      <div><dt>In shops</dt><dd>${fmtInt(row.in_shops)}<span>${fmtInt(row.in_shops_active)} active</span><span>${fmtInt(row.in_shops_inactive)} inactive or pending</span></dd></div>
      <div><dt>At Stratix</dt><dd>${fmtInt(row.at_stratix)}<span>${fmtInt(row.available_to_ship)} available to ship</span><span>${fmtInt(row.not_available)} not available</span></dd></div>
    </dl>`;
}

/* The workbook note and the bucket splits belong with the other definitions,
   under Ask about this data, not in the card a leader reads at a glance. */
function renderTerminalDefinitions(health) {
  const host = document.getElementById("ask-device-health");
  if (!host || !health?.e285) return;
  const row = health.e285;
  host.innerHTML = `
    <p>${escapeHtml(health.note || "")}</p>
    <dl class="ask-data-defs">
      <div><dt>Total terminals</dt><dd>${fmtInt(row.total)} — every E285 in VHQ plus serials only Stratix holds.</dd></div>
      <div><dt>In shops</dt><dd>${fmtInt(row.in_shops)} — the VHQ hierarchy path is a shop. Inactive means registered and not in use now, not lost or broken.</dd></div>
      <div><dt>At Stratix</dt><dd>${fmtInt(row.at_stratix)} — spare pool ${fmtInt(row.spare_pool)}, depot ${fmtInt(row.depot)}, awaiting NSO ${fmtInt(row.awaiting_nso)}, held for a pushed opening ${fmtInt(row.held_for_opening)}.</dd></div>
      <div><dt>Available to ship</dt><dd>${fmtInt(row.available_to_ship)} — iTrac status In Inventory. The other ${fmtInt(row.not_available)} are In Repair, Picked, or RMA Received.</dd></div>
      <div><dt>Location not confirmed</dt><dd>${fmtInt(row.location_not_confirmed)} — neither file shows a shop or Stratix, so the card leaves them out of the two buckets. This is not a lost-device count.</dd></div>
    </dl>
    <p class="ask-data-note">VHQ ${fmtDate(health.vhq_as_of)} · iTrac ${fmtDate(health.itrac_as_of)} · Source: ${escapeHtml(health.source || "Device Health workbook")}</p>`;
}

function quarterTicks(minMs, maxMs) {
  const start = new Date(minMs);
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const ticks = [];
  while (cursor.getTime() <= maxMs) {
    ticks.push(cursor.getTime());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 3, 1);
  }
  return ticks;
}

function monthTickLabel(value, firstMs) {
  const date = new Date(value);
  const month = date.toLocaleDateString("en-US", { month: "short" });
  const first = new Date(firstMs);
  const showYear = date.getMonth() === first.getMonth() || date.getMonth() === 0;
  return showYear ? `${month} '${String(date.getFullYear()).slice(2)}` : month;
}

function inventoryPoints(rows) {
  return (rows || [])
    .map((point) => ({ x: toMs(point.date), y: Number(point.inventory) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
}

/* Firm history is on hand. Published projection through the pipeline end is
   orders already in the pipeline. The tail after that end is the run-rate
   projection. Each segment starts where the previous one stops. */
function burndownSeries(payload) {
  const onHand = inventoryPoints(payload?.series?.firm);
  const pipelineEnd = String(payload?.summary?.pipeline_end_date || "");
  const published = payload?.series?.projected || [];
  const inPipeline = inventoryPoints(
    published.filter((point) => !pipelineEnd || String(point.date) <= pipelineEnd)
  );
  const projected = inventoryPoints(
    published.filter((point) => pipelineEnd && String(point.date) > pipelineEnd)
  );
  if (onHand.length && inPipeline.length && inPipeline[0].x !== onHand.at(-1).x) {
    inPipeline.unshift({ ...onHand.at(-1) });
  }
  if (inPipeline.length && projected.length && projected[0].x !== inPipeline.at(-1).x) {
    projected.unshift({ ...inPipeline.at(-1) });
  }
  return { onHand, inPipeline, projected };
}

/* The overview chart is the same three inventory states as the E235 chart,
   drawn on a time axis so the slope has months. */
function renderBurndown(payload) {
  const canvas = document.getElementById("chart-overview-burndown");
  if (!canvas || typeof Chart === "undefined" || !payload?.series) return;
  if (burndownChart) burndownChart.destroy();
  const series = burndownSeries(payload);
  const xs = [...series.onHand, ...series.inPipeline, ...series.projected].map((point) => point.x);
  if (!xs.length) return;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const yMax = Number(payload.chart?.y_max) || 6000;
  const lines = [
    { label: "On hand", data: series.onHand, borderColor: "#111111" },
    { label: "In pipeline", data: series.inPipeline, borderColor: "#006098" },
    { label: "Projected", data: series.projected, borderColor: "#d9272d" },
  ].filter((line) => line.data.length);
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: lines.map((line) => ({
        label: line.label,
        data: line.data,
        borderColor: line.borderColor,
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0,
        stepped: "after",
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      events: [],
      plugins: {
        legend: {
          display: true,
          position: "top",
          align: "end",
          labels: {
            boxWidth: 18,
            boxHeight: 3,
            usePointStyle: true,
            pointStyle: "line",
            font: { size: 10 },
            color: "#154167",
          },
        },
        tooltip: { enabled: false },
      },
      scales: {
        x: {
          type: "linear",
          min: minX,
          max: maxX,
          afterBuildTicks(axis) {
            axis.ticks = quarterTicks(axis.min, axis.max).map((value) => ({ value }));
          },
          ticks: {
            maxRotation: 0,
            autoSkip: true,
            color: "#5a6f82",
            font: { size: 10 },
            callback: (value) => monthTickLabel(value, minX),
          },
          grid: { display: false },
          border: { display: false },
        },
        y: {
          min: 0,
          max: yMax,
          ticks: {
            maxTicksLimit: 4,
            color: "#5a6f82",
            font: { size: 10 },
            callback: (value) => (value >= 1000 ? `${Math.round(value / 1000)}k` : `${value}`),
          },
          grid: { color: "#e6eef3" },
          border: { display: false },
        },
      },
    },
  });
}

function renderSource() {
  const node = document.getElementById("nso-health-source");
  if (!node || !nso) return;
  const source = nso.sources || {};
  const poNames = source.po_extracts || [];
  /* Name the scrape that carries the whole pipeline, not the newest file. A
     later partial scrape refreshes only the shops it lists, so naming it would
     say the rest of the table is more current than it is. */
  const basis = source.po_basis || poNames[0] || source.po_extract || "PO scrape";
  const later = poNames.filter((name) => name !== basis).length;
  const poLabel = later ? `${basis}, plus ${later} later partial scrape${later === 1 ? "" : "s"}` : basis;
  node.textContent = `Verifone to Stratix: ${source.orders_report || "orders report"}. Stratix to shop and First Tamper Check: ${poLabel}. iTrac lists devices held at Stratix, not which shop a shipment is going to.`;
}

function showWeek() {
  renderTable();
}

async function load() {
  const loader = window.__dashboardAuth?.loadJson;
  if (!loader) return;
  try {
    nso = await loader(NSO_URL);
    renderSource();
    renderTable();
  } catch (error) {
    const node = document.getElementById("nso-health-source");
    if (node) node.textContent = error?.message || "NSO health could not load.";
  }
  try {
    devicesPayload = await loader(DEVICES_URL);
    renderBurndown(devicesPayload);
  } catch (error) {
    const host = document.getElementById("e285-health");
    if (host && !host.childElementCount) host.textContent = "E285 health could not load.";
  }
  try {
    const health = await loader(HEALTH_URL);
    terminalHealth = health;
    window.__deviceHealthState = health;
    renderTerminals(health);
    renderTerminalDefinitions(health);
  } catch (error) {
    const host = document.getElementById("e285-health");
    if (host) host.textContent = "E285 health could not load.";
  }
}

function openBurndown() {
  window.__dashboardTabs?.activate("devices");
  window.__e235Roadmap?.activateSubtab("e235-burndown");
}

function bind() {
  document.getElementById("burndown-jump")?.addEventListener("click", openBurndown);
  window.addEventListener("dashboard:period", (event) => {
    const tab = event.detail?.tabId;
    if (tab && tab !== "overview") return;
    showWeek(event.detail?.periodId);
  });
}

function start() {
  bind();
  if (document.body.classList.contains("auth-unlocked")) load();
  else window.addEventListener("dashboard:unlocked", load, { once: true });
}

window.__deviceHealth = {
  shopsForWeek,
  openingsAhead,
  mondayOf,
  weekEnd,
  burndownSeries,
  getTerminals: () => terminalHealth,
  stratixLabel: null,
  openBurndown,
  showWeek,
};

document.addEventListener("DOMContentLoaded", start);
})();
