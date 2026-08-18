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

function weekLabel(week) {
  const explicit = firstString(week, ["label", "week_label", "period_label"]);
  if (explicit) return explicit;
  const start = firstString(week, ["week_start", "week", "date", "period_start", "start_date"]);
  const end = firstString(week, ["week_end", "period_end", "end_date"]);
  if (start && end) return `${start} – ${end}`;
  return start || "Most recent week";
}

function weekSortKey(week) {
  return (
    firstString(week, ["week_start", "week", "date", "period_start", "start_date"]) ||
    firstString(week, ["week_end", "period_end", "end_date"]) ||
    ""
  );
}

/** Accepts an array of tender rows or a keyed object, and fills in missing shares. */
function normalizeTenderMix(raw) {
  let rows = [];
  if (Array.isArray(raw)) {
    rows = raw.map((item) => ({
      label:
        firstString(item, ["label", "tender", "tender_type", "payment_type", "name", "type"]) ||
        "Unknown",
      amount: firstNumber(item, [
        "amount",
        "amt",
        "dollar_volume",
        "sales_amt",
        "total",
        "total_amount",
        "value",
      ]),
      pct: firstNumber(item, ["pct", "percent", "percentage", "share", "pct_of_total"]),
    }));
  } else if (raw && typeof raw === "object") {
    rows = Object.entries(raw).map(([key, item]) => {
      if (item !== null && typeof item === "object") {
        return {
          label: firstString(item, ["label", "tender", "name"]) || key,
          amount: firstNumber(item, [
            "amount",
            "amt",
            "dollar_volume",
            "sales_amt",
            "total",
            "total_amount",
            "value",
          ]),
          pct: firstNumber(item, ["pct", "percent", "percentage", "share", "pct_of_total"]),
        };
      }
      return { label: key, amount: Number(item), pct: null };
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

function normalizeCoverage(week) {
  const coverage = week?.shop_coverage || week?.coverage || {};
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

  const normalized = weeks
    .map((week) => {
      const { rows, total } = normalizeTenderMix(week?.tender_mix || week?.tenders || week?.mix);
      const reportedTotal = firstNumber(week?.totals || {}, [
        "sales_amt",
        "total_sales",
        "net_sales",
        "amount",
        "total",
      ]);
      return {
        label: weekLabel(week),
        sortKey: weekSortKey(week),
        tenders: rows,
        tenderTotal: total,
        reportedTotal,
        transactions: firstNumber(week?.totals || {}, [
          "transaction_cnt",
          "transactions",
          "txn_cnt",
          "count",
        ]),
        coverage: normalizeCoverage(week),
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

function showState(state, message) {
  const empty = document.getElementById("pos-empty");
  const content = document.getElementById("pos-content");
  if (!empty || !content) return;
  if (state === "ready") {
    empty.hidden = true;
    content.hidden = false;
    return;
  }
  empty.hidden = false;
  content.hidden = true;
  empty.innerHTML = message;
}

function renderPos(weeks) {
  if (!weeks.length) {
    window.__posSalesState = { weeks: [], latest: null };
    showState(
      "empty",
      `<h3>POS sales data not published yet</h3>
       <p>Add <code>${POS_DATA_URL}</code> to publish this tab. Run <code>python3 scripts/import_pos_sales.py &lt;path-to-export&gt;</code> to copy and validate the Snowflake export.</p>`
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
  showState("ready");
  window.dispatchEvent(new CustomEvent("dashboard:pos-loaded", { detail: { weekCount: weeks.length } }));
  return latest;
}

async function loadPosSales() {
  try {
    const res = await fetch(POS_DATA_URL, { cache: "no-store" });
    if (!res.ok) {
      showState(
        "empty",
        `<h3>POS sales data not published yet</h3>
         <p>Add <code>${POS_DATA_URL}</code> to publish this tab. Run <code>python3 scripts/import_pos_sales.py &lt;path-to-export&gt;</code> to copy and validate the Snowflake export.</p>`
      );
      return;
    }
    renderPos(normalizePosData(await res.json()));
  } catch (err) {
    showState(
      "empty",
      `<h3>POS sales data could not be read</h3><p>${String(err.message || err)}</p>`
    );
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
