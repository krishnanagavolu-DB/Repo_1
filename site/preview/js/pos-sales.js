/* In Shop POS Sales tab: reads data/in_shop_sales_data.json published with the site. */

(function () {
const POS_DATA_URL = "data/in_shop_sales_data.json";
const TENDER_ORDER = ["Card", "Cash", "Gift Card / Dutch Pass"];
const TENDER_COLORS = {
  Card: "#005F98",
  Cash: "#132550",
  "Gift Card / Dutch Pass": "#FDE021",
};

let posChart = null;

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function firstString(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function usd(value) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sharePct(value) {
  const share = Number(value) * 100;
  if (!Number.isFinite(share)) return "0.0%";
  if (share > 0 && share < 0.05) return "<0.1%";
  return `${share.toFixed(1)}%`;
}

const START_KEYS = ["week_start", "week_start_date", "week", "date", "period_start", "start_date"];
const END_KEYS = ["week_end", "week_end_date", "period_end", "end_date"];

/** "2026-08-10" -> "Aug 10". Returns null for anything that is not an ISO date. */
function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!match) return null;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[Number(match[2]) - 1];
  if (!month) return null;
  return { text: `${month} ${Number(match[3])}`, year: match[1] };
}

function weekLabel(week) {
  const explicit = firstString(week, ["label", "week_label", "period_label"]);
  if (explicit) return explicit;
  const start = firstString(week, START_KEYS);
  const end = firstString(week, END_KEYS);
  const startPart = shortDate(start);
  const endPart = shortDate(end);
  if (startPart && endPart) return `${startPart.text} – ${endPart.text}, ${endPart.year}`;
  if (start && end) return `${start} – ${end}`;
  return start || "Most recent week";
}

function weekSortKey(week) {
  return firstString(week, START_KEYS) || firstString(week, END_KEYS) || "";
}

const AMOUNT_KEYS = [
  "amount",
  "amt",
  "dollar_volume",
  "sales_amt",
  "SALES_VOLUME",
  "sales_volume",
  "total",
  "total_amount",
  "value",
];
const PCT_KEYS = [
  "pct",
  "percent",
  "percentage",
  "share",
  "pct_of_total",
  "pct_of_total_sales",
  "pct_of_sales",
];
const TXN_KEYS = ["TRANSACTION_COUNT", "transaction_count", "transaction_cnt", "transactions", "txn_cnt", "count"];

/** Accepts an array of tender rows or a keyed object, and fills in missing shares. */
function normalizeTenderMix(raw) {
  let rows = [];
  if (Array.isArray(raw)) {
    rows = raw.map((item) => ({
      label:
        firstString(item, ["label", "tender", "tender_type", "payment_type", "name", "type"]) ||
        "Unknown",
      amount: firstNumber(item, AMOUNT_KEYS),
      pct: firstNumber(item, PCT_KEYS),
      transactions: firstNumber(item, TXN_KEYS),
    }));
  } else if (raw && typeof raw === "object") {
    rows = Object.entries(raw).map(([key, item]) => {
      if (item !== null && typeof item === "object") {
        return {
          label: firstString(item, ["label", "tender", "name"]) || key,
          amount: firstNumber(item, AMOUNT_KEYS),
          pct: firstNumber(item, PCT_KEYS),
          transactions: firstNumber(item, TXN_KEYS),
        };
      }
      return { label: key, amount: Number(item), pct: null, transactions: null };
    });
  }

  rows = rows.filter((row) => Number.isFinite(row.amount));
  const total = rows.reduce((sum, row) => sum + row.amount, 0);

  for (const row of rows) {
    if (!Number.isFinite(row.pct)) {
      row.pct = total ? row.amount / total : 0;
    } else if (row.pct > 1.0000001) {
      row.pct = row.pct / 100;
    }
  }

  rows.sort((a, b) => {
    const ai = TENDER_ORDER.indexOf(a.label);
    const bi = TENDER_ORDER.indexOf(b.label);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return b.amount - a.amount;
  });

  return { rows, total };
}

function normalizeCoverage(week, rootCoverage) {
  const coverage = week?.shop_coverage || week?.coverage || rootCoverage || {};
  return {
    missingCount: firstNumber(coverage, [
      "missing_shops_count",
      "missing_count",
      "missing_shops",
      "excluded_shops_count",
    ]) || 0,
    note: firstString(coverage, ["missing_shops_note", "note", "missing_note", "details"]),
    includedCount: firstNumber(coverage, ["included_shops_count", "shops_included", "shop_count"]),
  };
}

/** Accepts a bare array of weeks or a wrapper object. */
function normalizePosData(raw) {
  let weeks = [];
  if (Array.isArray(raw)) weeks = raw;
  else if (Array.isArray(raw?.weeks)) weeks = raw.weeks;
  else if (Array.isArray(raw?.data)) weeks = raw.data;
  else if (Array.isArray(raw?.periods)) weeks = raw.periods;
  else if (raw && typeof raw === "object") weeks = [raw];

  const rootCoverage = (!Array.isArray(raw) && (raw?.shop_coverage || raw?.coverage)) || null;

  const normalized = weeks
    .map((week) => {
      const { rows, total } = normalizeTenderMix(week?.tender_mix || week?.tenders || week?.mix);
      const totals = week?.totals || {};
      const reportedTotal = firstNumber(totals, [
        "sales_amt",
        "SALES_VOLUME",
        "sales_volume",
        "total_sales",
        "net_sales",
        "amount",
        "total",
      ]);
      const transactions = firstNumber(totals, TXN_KEYS);
      return {
        label: weekLabel(week),
        sortKey: weekSortKey(week),
        tenders: rows,
        tenderTotal: total,
        reportedTotal,
        transactions,
        avgTicket:
          firstNumber(totals, ["AVG_TICKET", "avg_ticket", "average_ticket"]) ??
          (reportedTotal && transactions ? reportedTotal / transactions : null),
        coverage: normalizeCoverage(week, rootCoverage),
      };
    })
    .filter((week) => week.tenders.length);

  normalized.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));
  return normalized;
}

function renderBanner(week) {
  const banner = document.getElementById("pos-coverage-banner");
  if (!banner) return;
  const { missingCount, note } = week.coverage;
  if (!missingCount || missingCount <= 0) {
    banner.hidden = true;
    banner.innerHTML = "";
    return;
  }
  const shopWord = missingCount === 1 ? "shop" : "shops";
  const tip = note ? ` title="${String(note).replace(/"/g, "&quot;")}"` : "";
  banner.hidden = false;
  banner.innerHTML = `
    <strong>Warning:</strong>
    <span>${missingCount} ${shopWord} ${
      missingCount === 1 ? "was" : "were"
    } excluded from this calculation because they are missing from the Legacy/CO mapping extract.</span>
    ${note ? `<button type="button" class="pos-banner-info"${tip} aria-label="Where to find the mapping file">Where is this from?</button>` : ""}
  `;
}

function renderCards(week) {
  const grid = document.getElementById("pos-kpi-grid");
  if (!grid) return;
  grid.innerHTML = week.tenders
    .map(
      (tender) => `
      <article class="kpi-card pos-card">
        <div class="label">${tender.label}</div>
        <div class="kpi-value">${usd(tender.amount)}</div>
        <div class="kpi-subvalue">${sharePct(tender.pct)} of total sales</div>
      </article>`
    )
    .join("");
}

function renderTable(week) {
  const body = document.getElementById("pos-tender-table");
  if (!body) return;
  const total = week.tenderTotal;
  const rows = week.tenders
    .map(
      (tender) => `
      <tr>
        <td>${tender.label}</td>
        <td>${usd(tender.amount)}</td>
        <td>${sharePct(tender.pct)}</td>
      </tr>`
    )
    .join("");
  body.innerHTML = `${rows}
    <tr class="pos-total-row">
      <td>Total</td>
      <td>${usd(total)}</td>
      <td>100.0%</td>
    </tr>`;
}

function renderChart(week) {
  const canvas = document.getElementById("chart-pos-tender");
  if (!canvas || typeof Chart === "undefined") return;
  if (posChart) posChart.destroy();
  posChart = new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: week.tenders.map((t) => t.label),
      datasets: [
        {
          data: week.tenders.map((t) => t.pct),
          backgroundColor: week.tenders.map(
            (t, idx) => TENDER_COLORS[t.label] || ["#005F98", "#132550", "#FDE021"][idx % 3]
          ),
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
            label: (ctx) => `${sharePct(week.tenders[ctx.dataIndex]?.pct)}`,
          },
        },
      },
    },
  });
}

const IMPORT_STEPS = [
  "Export the weekly file from Snowflake to <code>in_shop_sales_data.json</code>.",
  "Run <code>python3 scripts/import_pos_sales.py &lt;path-to-export&gt; --preview-only</code> to validate and copy it into the site data.",
  "Commit the updated <code>site/preview/data/in_shop_sales_data.json</code> and redeploy.",
];

function showNotice(options) {
  const empty = document.getElementById("pos-empty");
  const content = document.getElementById("pos-content");
  if (!empty || !content) return;
  content.hidden = true;
  empty.hidden = false;
  if (window.__notices) {
    window.__notices.renderNotice(empty, options);
  } else {
    empty.innerHTML = `<h3>${options.title}</h3>`;
  }
}

function showReady() {
  const empty = document.getElementById("pos-empty");
  const content = document.getElementById("pos-content");
  if (!empty || !content) return;
  empty.hidden = true;
  content.hidden = false;
}

function notPublishedNotice(technical) {
  showNotice({
    title: "POS sales for this week aren't published yet",
    message: "Once the weekly POS export is loaded, tender mix will appear here.",
    technical,
    fix: IMPORT_STEPS,
  });
}

function renderPos(weeks) {
  if (!weeks.length) {
    window.__posSalesState = { weeks: [], latest: null };
    notPublishedNotice(
      `No usable weeks found in ${POS_DATA_URL}. Each week needs a tender_mix with labels and amounts.`
    );
    return;
  }
  const latest = weeks[weeks.length - 1];
  window.__posSalesState = { weeks, latest };
  const periodEl = document.getElementById("pos-period-label");
  if (periodEl) periodEl.textContent = latest.label;
  renderBanner(latest);
  renderCards(latest);
  renderTable(latest);
  renderChart(latest);
  showReady();
  window.dispatchEvent(new CustomEvent("dashboard:pos-loaded", { detail: { weekCount: weeks.length } }));
  return latest;
}

async function loadPosSales() {
  try {
    const res = await fetch(POS_DATA_URL, { cache: "no-store" });
    if (!res.ok) {
      notPublishedNotice(`Request for ${POS_DATA_URL} returned HTTP ${res.status}.`);
      return;
    }
    renderPos(normalizePosData(await res.json()));
  } catch (err) {
    showNotice({
      title: "POS sales couldn't be displayed right now",
      message:
        "Try refreshing in a moment. If it keeps happening, share the technical details below with the data team.",
      technical: String(err?.message || err),
      fix: IMPORT_STEPS,
    });
  }
}

window.__posSales = {
  normalizePosData,
  normalizeTenderMix,
  usd,
  sharePct,
  loadPosSales,
  renderPos,
  getLatestWeek() {
    return window.__posSalesState?.latest || null;
  },
  getWeeks() {
    return window.__posSalesState?.weeks || [];
  },
};

function startPosWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    loadPosSales();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => loadPosSales(), { once: true });
}

document.addEventListener("DOMContentLoaded", startPosWhenUnlocked);
})();
