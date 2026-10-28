/* Payment device health on the executive overview: this week's openings, and the E285 contract. */

(function () {
const NSO_URL = "data/nso_health.json";
const DEVICES_URL = "data/payment_devices.json";
let nso = null;
let devicesPayload = null;
let burndownChart = null;
let activeWeek = null;

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

/* An empty sales week looks forward two Monday–Sunday weeks before giving up. */
function openingsForPeriod(shops, weekStart) {
  const current = shopsForWeek(shops, weekStart);
  if (!weekStart || weekStart === "history" || current.length) {
    return { shops: current, extended: false, start: weekStart, end: weekStart ? weekEnd(weekStart) : null };
  }
  const start = addDays(weekStart, 7);
  const end = addDays(weekStart, 20);
  const extra = (shops || []).filter((shop) => shop.opening_date >= start && shop.opening_date <= end);
  return { shops: extra, extended: extra.length > 0, start, end };
}

function pill(value) {
  const tone = String(value || "").toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="health-pill health-${escapeHtml(tone)}">${escapeHtml(value || "—")}</span>`;
}

function renderTable(weekStart) {
  const body = document.getElementById("nso-health-body");
  const empty = document.getElementById("nso-health-empty");
  const week = document.getElementById("nso-health-week");
  if (!body) return;
  const window = openingsForPeriod(nso?.shops, weekStart);
  const rows = window.shops;
  if (week) {
    if (!weekStart || weekStart === "history") week.textContent = "Pick a week to see the shops opening then";
    else if (window.extended) {
      week.textContent = `No openings ${fmtDate(weekStart)} – ${fmtDate(weekEnd(weekStart))}. Showing the next two weeks, ${fmtDate(window.start)} – ${fmtDate(window.end)}.`;
    } else week.textContent = `Shops opening ${fmtDate(weekStart)} – ${fmtDate(weekEnd(weekStart))}`;
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
    if (rows.length || !weekStart || weekStart === "history") empty.hidden = true;
    else {
      const next = (nso?.shops || []).find((shop) => shop.opening_date > weekEnd(weekStart));
      empty.hidden = false;
      empty.textContent = next
        ? `No shops are projected to open this week. The next opening is ${next.id} on ${fmtDate(next.opening_date)}.`
        : "No shops are projected to open this week.";
    }
  }
  requestAnimationFrame(syncScrollCue);
}

function syncScrollCue() {
  const wrap = document.getElementById("nso-health-scroll");
  const frame = document.getElementById("nso-health-frame");
  const cue = document.getElementById("nso-health-scroll-cue");
  if (!wrap || !frame || !cue) return;
  const overflow = wrap.scrollHeight - wrap.clientHeight > 8;
  const atEnd = wrap.scrollTop + wrap.clientHeight >= wrap.scrollHeight - 8;
  frame.classList.toggle("is-overflow", overflow);
  frame.classList.toggle("at-end", !overflow || atEnd);
  cue.hidden = !overflow || atEnd;
}

function renderTerminals(payload) {
  const host = document.getElementById("e285-health");
  const asof = document.getElementById("device-health-asof");
  if (!host || !payload?.summary) return;
  const summary = payload.summary;
  if (asof) asof.textContent = `As of ${currentDateLabel()}`;
  host.innerHTML = `
    <p class="health-kicker">${fmtInt(summary.baseline_inventory)} E285s on the Feb 1 contract</p>
    <dl class="e285-split">
      <div><dt>Shipped since Feb 1</dt><dd>${fmtInt(summary.shipped_qty)} units · ${fmtInt(summary.shipped_shops)} shops</dd></div>
      <div><dt>Booked, not shipped</dt><dd>${fmtInt(summary.booked_qty)} units</dd></div>
      <div><dt>Awaiting a Verifone order</dt><dd>${fmtInt(summary.pending_units)} units · ${fmtInt(summary.pending_shops)} openings</dd></div>
    </dl>
    <p class="health-source">Depot, spare pool, and devices staged at Stratix for an opening are not in this drop. That split needs the iTraq report.</p>`;
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

/* The overview chart is the same firm-then-projected inventory, drawn on a
   time axis so the slope has months. A category axis of every order date
   hid the calendar and left a line with no scale. */
function renderBurndown(payload) {
  const canvas = document.getElementById("chart-overview-burndown");
  if (!canvas || typeof Chart === "undefined" || !payload?.series) return;
  if (burndownChart) burndownChart.destroy();
  const firm = (payload.series.firm || [])
    .map((point) => ({ x: toMs(point.date), y: Number(point.inventory) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const projected = (payload.series.projected || [])
    .map((point) => ({ x: toMs(point.date), y: Number(point.inventory) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (firm.length && projected.length && projected[0].x !== firm.at(-1).x) projected.unshift(firm.at(-1));
  const xs = [...firm, ...projected].map((point) => point.x);
  if (!xs.length) return;
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const yMax = Number(payload.chart?.y_max) || 6000;
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: "On hand",
          data: firm,
          borderColor: "#154167",
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
        },
        {
          label: "Projected",
          data: projected,
          borderColor: "#d9272d",
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0,
        },
      ],
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
  const poLabel = poNames.length > 1 ? `PO scrapes through ${poNames[poNames.length - 1]}` : (source.po_extract || "PO scrape");
  node.textContent = `Verifone to Stratix: ${source.orders_report || "orders report"}. Stratix to shop and First Tamper Check: ${poLabel}. iTraq was not in this drop.`;
}

function showWeek(weekStart) {
  activeWeek = weekStart;
  renderTable(weekStart);
}

async function load() {
  const loader = window.__dashboardAuth?.loadJson;
  if (!loader) return;
  try {
    nso = await loader(NSO_URL);
    renderSource();
    renderTable(activeWeek);
  } catch (error) {
    const node = document.getElementById("nso-health-source");
    if (node) node.textContent = error?.message || "NSO health could not load.";
  }
  try {
    devicesPayload = await loader(DEVICES_URL);
    renderTerminals(devicesPayload);
    renderBurndown(devicesPayload);
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
  document.getElementById("nso-health-scroll")?.addEventListener("scroll", syncScrollCue, { passive: true });
  window.addEventListener("resize", syncScrollCue);
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

window.__deviceHealth = { shopsForWeek, openingsForPeriod, weekEnd, stratixLabel: null, openBurndown, showWeek };

document.addEventListener("DOMContentLoaded", start);
})();
