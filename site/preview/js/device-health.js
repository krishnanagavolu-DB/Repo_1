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

function fmtDate(iso) {
  const [year, month, day] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!year || !month) return iso || "—";
  return new Date(year, month - 1, day || 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
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

function pill(value) {
  const tone = String(value || "").toLowerCase().replace(/[^a-z]+/g, "-");
  return `<span class="health-pill health-${escapeHtml(tone)}">${escapeHtml(value || "—")}</span>`;
}

function renderTable(weekStart) {
  const body = document.getElementById("nso-health-body");
  const empty = document.getElementById("nso-health-empty");
  const week = document.getElementById("nso-health-week");
  if (!body) return;
  const rows = shopsForWeek(nso?.shops, weekStart);
  if (week) {
    week.textContent = weekStart && weekStart !== "history"
      ? `Shops opening ${fmtDate(weekStart)} – ${fmtDate(weekEnd(weekStart))}`
      : "Pick a week to see the shops opening then";
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
  if (!empty) return;
  if (rows.length || !weekStart || weekStart === "history") {
    empty.hidden = true;
    return;
  }
  const next = (nso?.shops || []).find((shop) => shop.opening_date > weekEnd(weekStart));
  empty.hidden = false;
  empty.textContent = next
    ? `No shops are projected to open this week. The next opening is ${next.id} on ${fmtDate(next.opening_date)}.`
    : "No shops are projected to open this week.";
}

function renderTerminals(payload) {
  const host = document.getElementById("e285-health");
  const asof = document.getElementById("device-health-asof");
  if (!host || !payload?.summary) return;
  const summary = payload.summary;
  if (asof) asof.textContent = `Devices as of ${fmtDate(summary.as_of)}`;
  host.innerHTML = `
    <p class="health-kicker">${fmtInt(summary.baseline_inventory)} E285s on the Feb 1 contract</p>
    <dl class="e285-split">
      <div><dt>Shipped since Feb 1</dt><dd>${fmtInt(summary.shipped_qty)} units · ${fmtInt(summary.shipped_shops)} shops</dd></div>
      <div><dt>Booked, not shipped</dt><dd>${fmtInt(summary.booked_qty)} units</dd></div>
      <div><dt>Awaiting a Verifone order</dt><dd>${fmtInt(summary.pending_units)} units · ${fmtInt(summary.pending_shops)} openings</dd></div>
    </dl>
    <p class="health-source">Depot, spare pool, and devices staged at Stratix for an opening are not in this drop. That split needs the iTraq report.</p>`;
}

function renderBurndown(payload) {
  const canvas = document.getElementById("chart-overview-burndown");
  if (!canvas || typeof Chart === "undefined" || !payload?.series) return;
  if (burndownChart) burndownChart.destroy();
  const firm = payload.series.firm || [];
  const projected = payload.series.projected || [];
  const labels = [...firm, ...projected].map((point) => point.date);
  burndownChart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data: [...firm.map((point) => point.inventory), ...projected.map(() => null)],
          borderColor: "#111",
          borderWidth: 2,
          pointRadius: 0,
          tension: 0,
        },
        {
          data: [...firm.map(() => null), ...projected.map((point) => point.inventory)],
          borderColor: "#d9272d",
          borderWidth: 2,
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
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false, min: 0 } },
    },
  });
}

function renderSource() {
  const node = document.getElementById("nso-health-source");
  if (!node || !nso) return;
  const source = nso.sources || {};
  node.textContent = `Verifone to Stratix: ${source.orders_report || "orders report"}. Stratix to shop and First Tamper Check: ${source.po_extract || "PO scrape"}. iTraq was not in this drop.`;
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

window.__deviceHealth = { shopsForWeek, weekEnd, stratixLabel: null, openBurndown, showWeek };

document.addEventListener("DOMContentLoaded", start);
})();
