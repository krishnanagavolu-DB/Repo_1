/* Smarter data-only assistant: deterministic answers from dashboard.json. */

/* Scoped so these helpers cannot overwrite the dashboard's formatters. */
(function () {
const PAYMENT_DEFINITIONS = [
  {
    terms: ["auth rate", "authorization rate", "approval rate"],
    title: "Auth rate",
    body: "Approved authorization requests (response code 00) divided by all authorization requests.",
  },
  {
    terms: ["aov", "average order value"],
    title: "AOV (Average Order Value)",
    body: "On Card present (Worldpay): sales dollars divided by sales transaction count. That figure includes authorized sale + tip when tips are present, so it will sit above the All payments average ticket.",
  },
  {
    terms: [
      "sales volume on all payments",
      "all payments sales",
      "xenial sales volume",
      "pos sales dollars",
      "sales_volume",
    ],
    title: "SALES_VOLUME",
    body: "Net company-owned Xenial payment dollars. Refunds are negative. Tips and change are excluded. Lines over $10k are dropped. No Legacy, no unmapped shops, no CHECK/UNKNOWN tender types.",
  },
  {
    terms: ["avg ticket", "average ticket", "avg payment", "average payment", "avg_ticket", "average check"],
    title: "AVG_TICKET (All payments)",
    body: "On All payments (Xenial): sales dollars divided by the published ticket basis. Published weeks currently use sales ÷ payment lines. A later rebuild will switch to sales ÷ distinct ORDER_ID (guest checks) and publish AVG_TICKET_BASIS = distinct_ORDER_ID. Older weeks keep their original basis until rebuilt. This is all tenders, not card-only, and not Worldpay.",
  },
  {
    terms: ["transaction_count", "transaction count", "payment lines", "payments count"],
    title: "TRANSACTION_COUNT",
    body: "Count of Xenial payment lines after SYS_HASH dedupe. Two tenders on one guest check count as two lines. This is not distinct ORDER_ID.",
  },
  {
    terms: ["order_count", "order count", "guest checks", "guest check", "distinct orders"],
    title: "ORDER_COUNT",
    body: "Distinct Xenial ORDER_ID values — one guest check. Not published in the current All payments weeks; it arrives with the AVG_TICKET rebuild that switches the average to sales ÷ orders.",
  },
  {
    terms: ["returns as % of sales", "return rate", "refund rate"],
    title: "Returns as % of sales",
    body: "Return/refund dollars divided by sales dollars.",
  },
  {
    terms: ["ic rate", "interchange rate"],
    title: "IC rate",
    body: "Interchange fees divided by sales dollars. Amex fees are reported as $0 in this feed, so this is not the full cost of acceptance.",
  },
  {
    terms: ["downgrade rate", "downgrade", "surcharge rate"],
    title: "Downgrade rate",
    body: "Share of sales dollars with a Worldpay surcharge/downgrade reason, often caused by missing qualification data such as Level 2.",
  },
  {
    terms: ["key entered", "keyed", "manually entered", "manual entry"],
    title: "Key entered",
    body: "A card number typed manually rather than tapped, inserted, or swiped. It often has lower approval and higher risk/cost because the physical card was not electronically read.",
  },
  {
    terms: ["contactless", "tap"],
    title: "Contactless",
    body: "A card or device tapped at the terminal using NFC.",
  },
  {
    terms: ["chip", "dip"],
    title: "Chip / Dip",
    body: "A physical card inserted into the terminal so its EMV chip can be read.",
  },
  {
    terms: ["swipe", "magstripe"],
    title: "Swipe",
    body: "The card's magnetic stripe was read. This is a fallback/legacy entry method and typically has weaker approval performance than contactless or chip.",
  },
  {
    terms: ["entry other", "other entry", "other"],
    title: "Other entry method",
    body: "Worldpay entry-mode codes that do not map to Contactless, Chip/Dip, Swipe, or Key entered. In this feed that mainly represents codes 80/85; the aggregate report does not provide a more detailed label.",
  },
  {
    terms: ["decline reason", "do not honor"],
    title: "Decline reasons",
    body: "Issuer/network response messages for authorization requests that were not approved.",
  },
  {
    terms: ["wallet mix", "mobile wallet"],
    title: "Wallet mix",
    body: "Share of sales transactions by mobile wallet versus physical card.",
  },
  {
    terms: ["ytd", "year to date"],
    title: "YTD",
    body: "All loaded weeks in the current calendar year.",
  },
  {
    terms: ["all payments", "pos sales", "in shop pos", "tender mix", "tender", "xenial"],
    title: "In Shop · All payments",
    body: "Every tender taken at company-owned shops — Card (CREDIT), Cash (CASH), and Gift Card / Dutch Pass (GIFT + CUSTOM) — from Xenial SILVER_CLEANSED.XENIAL_BULK.ORDER_DETAILS_FEED joined to Shop_Type_Mapping on STAND_NUMBER = NewCoID #. Weeks are completed Monday–Sunday on BUSINESS_DATE. Mix of those three = 100%. Card present is the separate Worldpay view of card authorizations.",
  },
  {
    terms: ["gift card", "dutch pass", "custom"],
    title: "Gift Card / Dutch Pass",
    body: "Xenial PAYMENT_TYPE GIFT plus CUSTOM. CUSTOM is Dutch Pass — the loyalty-app / digital-wallet scan at the window. Together they form one tender bucket in the mix.",
  },
  {
    terms: ["cash"],
    title: "Cash",
    body: "Xenial PAYMENT_TYPE = CASH at company-owned shops. Cash never appears on Worldpay.",
  },
  {
    terms: ["card", "credit"],
    title: "Card",
    body: "Xenial PAYMENT_TYPE = CREDIT. All credit is one Card bucket here — no debit split, and Visa/MC/Amex/Discover brand mix is not published in this JSON.",
  },
  {
    terms: ["tips", "tip", "gratuity"],
    title: "Tips excluded",
    body: "Tips are not drink sales, so All payments leaves them out of SALES_VOLUME. Card networks still authorize sale + tip, which is why Worldpay average ticket stays higher than the Xenial sales ticket.",
  },
  {
    terms: ["change", "cash back"],
    title: "Change excluded",
    body: "Change is cash handed back to the guest, not sales. It never appears on Worldpay and is excluded from All payments SALES_VOLUME.",
  },
  {
    terms: ["missing shops", "shop coverage", "legacy/co mapping", "legacy co mapping", "company owned", "company-owned"],
    title: "Company-owned shops only",
    body: "Every channel on this dashboard is limited to company-owned shops. Shop_Type_Mapping.xlsx is the CO/Legacy authority. Non-CO stands are filtered out so POS, Worldpay, and future feeds stay on the same footprint.",
  },
];

const KPI_ALIASES = [
  { key: "auth_rate", terms: ["auth rate", "authorization rate", "approval rate", "approvals"] },
  { key: "decline_volume", terms: ["decline $", "decline dollars", "declined dollars", "decline volume"] },
  { key: "sales_volume", terms: ["sales volume", "sales $", "sales dollars", "revenue"] },
  { key: "downgrade_rate", terms: ["downgrade rate", "downgrade", "surcharge rate"] },
  { key: "ic_fee", terms: ["ic fee", "interchange fee", "fee dollars"] },
  { key: "ic_rate", terms: ["ic rate", "interchange rate"] },
  { key: "returns_pct_of_sales", terms: ["returns as %", "returns percent", "return rate", "refund rate"] },
  { key: "transaction_volume", terms: ["transaction volume", "transaction count", "transactions"] },
  { key: "aov", terms: ["aov", "average order"] },
];

const ENTRY_ALIASES = [
  { label: "Contactless", terms: ["contactless", "tap", "tapped"] },
  { label: "Chip / Dip", terms: ["chip", "dip", "inserted"] },
  { label: "Swipe", terms: ["swipe", "swiped", "magstripe"] },
  { label: "Key entered", terms: ["key entered", "keyed", "manual entry", "manually entered"] },
  { label: "Other", terms: ["other"] },
];

const MIX_ALIASES = {
  entry: ["entry method mix", "entry mix"],
  payment: ["payment type mix", "payment mix", "card brand mix", "card mix"],
  wallet: ["wallet mix", "mobile wallet mix"],
};

const chatContext = {
  topic: null,
  kpiKey: null,
  mixKind: null,
  entryLabel: null,
  lastView: null,
  activeTab: null,
};

let benchmarkData = window.__benchmarkData || null;

const OFF_TOPIC_REPLIES = [
  "I’m the payments data desk, not the whole internet. Try “Explain the exclusions in the data”, “What are the assumptions?”, or ask me to compare weeks or drill into a payment metric.",
  "That’s outside my lane. I’m much better at “Why did sales fall?”, “Explain the exclusions in the data”, or “What assumptions were made?”",
  "I only have the data on this dashboard and a payments glossary. Try “What needs attention?”, “Explain the exclusions in the data”, or “What are the assumptions?”",
];

function getState() {
  return window.__dashboardState || null;
}

function currentPeriod() {
  const state = getState();
  if (!state?.data) return null;
  if (state.periodId === "ytd") return state.data.periods.ytd;
  return state.data.periods.weeks.find((w) => w.id === state.periodId) || state.data.periods.weeks.at(-1);
}

function allWeeks() {
  return getState()?.data?.periods?.weeks || [];
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9%$?\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatKpiValue(key, value) {
  const meta = (window.KPI_ORDER || []).find((k) => k.key === key);
  if (meta?.format) return meta.format(Number(value));
  if (key.includes("rate") || key.includes("pct")) return `${(Number(value) * 100).toFixed(2)}%`;
  return Number(value).toLocaleString();
}

function money(value, digits = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function count(value) {
  return Math.round(Number(value || 0)).toLocaleString("en-US");
}

function pct(value, digits = 2) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

function signed(value, digits = 2) {
  const n = Number(value || 0);
  return `${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n).toFixed(digits)}`;
}

function sentenceDirection(delta, inverse = false) {
  if (Math.abs(Number(delta || 0)) < 1e-12) return "flat";
  const improved = inverse ? delta < 0 : delta > 0;
  return improved ? "improved" : "worsened";
}

function rememberView(title, rows, note = "") {
  chatContext.lastView = {
    title,
    rows: (rows || []).filter((row) => row && Number.isFinite(Number(row.value))),
    note,
  };
}

function formatRememberedView(mode) {
  const view = chatContext.lastView;
  if (!view?.rows?.length) {
    return "Ask for a metric, trend, mix, or breakdown first—then I can reformat that result.";
  }
  const rows = view.rows;
  if (mode === "bars") {
    const max = Math.max(...rows.map((row) => Math.abs(Number(row.value))), 1);
    const lines = rows.map((row) => {
      const size = Math.max(1, Math.round((Math.abs(Number(row.value)) / max) * 16));
      return `${row.label.padEnd(20, " ")} ${"█".repeat(size)} ${row.display}`;
    });
    return `**${view.title} — visual bars**\n${lines.join("\n")}${view.note ? `\n\n${view.note}` : ""}`;
  }
  if (mode === "table") {
    const lines = rows.map((row) => `• **${row.label}** | ${row.display}${row.secondary ? ` | ${row.secondary}` : ""}`);
    return `**${view.title} — table view**\n${lines.join("\n")}${view.note ? `\n\n${view.note}` : ""}`;
  }
  if (mode === "percentages") {
    const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.value)), 0);
    if (!total) return "I can’t convert that result to percentages because its total is zero.";
    const lines = rows.map((row) => `• ${row.label}: **${pct(row.value / total, 1)}**`);
    return `**${view.title} — percentage view**\n${lines.join("\n")}`;
  }
  const ranked = [...rows].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const top = ranked.slice(0, 3);
  return `**Executive summary — ${view.title}**\n${top.map((row, index) => `${index + 1}. **${row.label}: ${row.display}**`).join("\n")}\n\n${view.note || "Largest values shown first; ask for a table or bars to see the full result."}`;
}

function detectFormatRequest(q) {
  const refersToPrior = /\b(that|it|this|the result|the answer|same data)\b/.test(q);
  if (!refersToPrior) return null;
  if (/\b(bar chart|bars|visual|graph)\b/.test(q)) return "bars";
  if (/\b(table|tabular|columns)\b/.test(q)) return "table";
  if (/\b(as percentages|percentage view|percent view|convert.*percent)\b/.test(q)) return "percentages";
  if (/\b(executive summary|summarize|summary|in words|narrative)\b/.test(q) && chatContext.lastView) return "summary";
  return null;
}

function detectKpiKey(q) {
  let best = null;
  let score = 0;
  for (const item of KPI_ALIASES) {
    for (const term of item.terms) {
      if (q.includes(term) && term.length > score) {
        best = item.key;
        score = term.length;
      }
    }
  }
  return best;
}

function detectEntryLabel(q) {
  let best = null;
  let score = 0;
  for (const item of ENTRY_ALIASES) {
    for (const term of item.terms) {
      if (q.includes(term) && term.length > score) {
        best = item.label;
        score = term.length;
      }
    }
  }
  return best;
}

function detectMixKind(q) {
  for (const [kind, terms] of Object.entries(MIX_ALIASES)) {
    if (terms.some((term) => q.includes(term))) return kind;
  }
  if (/\b(apple pay|google pay|samsung pay|garmin pay|fitbit|wallet)\b/.test(q)) return "wallet";
  if (/\b(visa|mastercard|amex|discover|card brand)\b/.test(q)) return "payment";
  return null;
}

function findDefinition(q) {
  let best = null;
  let score = 0;
  for (const def of PAYMENT_DEFINITIONS) {
    for (const term of def.terms) {
      if (q.includes(term) && term.length > score) {
        best = def;
        score = term.length;
      }
    }
  }
  return best;
}

function isDefinitionIntent(q) {
  return /\b(what is|what's|what does|define|definition|meaning|explain what)\b/.test(q);
}

function kpiMeta(key) {
  return (window.KPI_ORDER || []).find((k) => k.key === key) || { key, label: key };
}

function previousWeekFor(period) {
  const weeks = allWeeks();
  const idx = weeks.findIndex((w) => w.id === period?.id);
  return idx > 0 ? weeks[idx - 1] : null;
}

function answerKpi(key, options = {}) {
  const period = currentPeriod();
  if (!period?.kpis?.[key]) return "That metric isn’t available for this period.";
  const obj = period.kpis[key];
  const meta = kpiMeta(key);
  chatContext.topic = "kpi";
  chatContext.kpiKey = key;

  if (options.trend) return answerTrend(key);

  let comparison = "No prior-week comparison is available.";
  if (obj.delta !== null && obj.delta !== undefined) {
    const inverse = Boolean(meta.invertDelta);
    const direction = sentenceDirection(obj.delta, inverse);
    comparison = `${direction === "improved" ? "Better" : direction === "worsened" ? "Worse" : "Flat"} vs prior week: **${meta.formatDelta(obj.delta)}**.`;
  }

  let conversion = "";
  if (key === "decline_volume") {
    const sales = period.kpis.sales_volume?.value || period.totals?.sales_amt || 0;
    conversion = ` That equals **${pct(obj.value / sales)} of sales volume**.`;
  } else if (key === "ic_fee") {
    const sales = period.kpis.sales_volume?.value || period.totals?.sales_amt || 0;
    const tx = period.kpis.transaction_volume?.value || period.totals?.sales_cnt || 0;
    conversion = ` That is **${pct(obj.value / sales)} of sales** and about **${money(obj.value / tx, 2)} per sales transaction**.`;
  } else if (key === "returns_pct_of_sales" && period.totals?.return_amt !== undefined) {
    conversion = ` Return dollars were **${money(period.totals.return_amt)}**.`;
  }

  return `For **${period.label}**, **${meta.label}** is **${formatKpiValue(key, obj.value)}**. ${comparison}${conversion}`;
}

function answerTrend(key) {
  const period = currentPeriod();
  const obj = period?.kpis?.[key];
  if (!obj) return "I can’t build that trend from the loaded data.";
  const meta = kpiMeta(key);
  const history = (obj.history || []).slice(-6);
  if (history.length < 2) return `I only have one data point for ${meta.label}, so there isn’t a trend yet.`;

  chatContext.topic = "trend";
  chatContext.kpiKey = key;

  const first = history[0].value;
  const last = history.at(-1).value;
  const change = last - first;
  const inverse = Boolean(meta.invertDelta);
  const direction = sentenceDirection(change, inverse);
  const best = [...history].sort((a, b) => inverse ? a.value - b.value : b.value - a.value)[0];
  const worst = [...history].sort((a, b) => inverse ? b.value - a.value : a.value - b.value)[0];
  const points = history.map((h) => `${h.week_start}: ${formatKpiValue(key, h.value)}`).join(" → ");
  rememberView(
    `${meta.label} trend`,
    history.map((item) => ({
      label: item.week_start,
      value: item.value,
      display: formatKpiValue(key, item.value),
    })),
    `Best: ${formatKpiValue(key, best.value)}; worst: ${formatKpiValue(key, worst.value)}.`
  );

  let interpretation = `${meta.label} ${direction} over the loaded trend`;
  if (key.includes("rate") || key.includes("pct")) {
    interpretation += ` by **${signed(change * 100)} percentage points**`;
  } else {
    interpretation += ` by **${meta.formatDelta ? meta.formatDelta(change) : signed(change)}**`;
  }

  return `**${meta.label} trend**\n${points}\n\n${interpretation}. Best: **${formatKpiValue(key, best.value)}** (${best.week_start}); worst: **${formatKpiValue(key, worst.value)}** (${worst.week_start}).`;
}

function answerTrendSummary() {
  const keys = ["auth_rate", "decline_volume", "sales_volume", "downgrade_rate", "ic_rate"];
  const period = currentPeriod();
  const lines = keys.map((key) => {
    const obj = period?.kpis?.[key];
    const meta = kpiMeta(key);
    if (!obj || obj.delta === null || obj.delta === undefined) return null;
    return `• ${meta.label}: ${formatKpiValue(key, obj.value)} (${meta.formatDelta(obj.delta)} vs prior week)`;
  }).filter(Boolean);
  return `**Leadership trend snapshot — ${period?.label}**\n${lines.join("\n")}`;
}

function answerEntryAuth(q, requestedLabel = null) {
  const period = currentPeriod();
  const items = period?.auth_rate_by_entry || [];
  if (!items.length) return "Auth rate by entry method isn’t available for this period.";
  const label = requestedLabel || detectEntryLabel(q);
  chatContext.topic = "auth_entry";

  if (label) {
    const item = items.find((i) => normalize(i.label) === normalize(label));
    if (!item) return `I don’t see ${label} in this period’s entry-method data.`;
    chatContext.entryLabel = item.label;
    const declined = Number(item.total_cnt) - Number(item.approved_cnt);
    const totalAttempts = items.reduce((sum, i) => sum + Number(i.total_cnt || 0), 0);
    const definition = findDefinition(normalize(item.label));
    rememberView(
      `${item.label} authorization outcome`,
      [
        { label: "Approved", value: Number(item.approved_cnt), display: count(item.approved_cnt) },
        { label: "Declined", value: declined, display: count(declined) },
      ],
      `Auth rate: ${pct(item.auth_rate)}.`
    );
    const note = item.label === "Other"
      ? " “Other” combines Worldpay entry-mode codes 80/85; this aggregate file does not provide a finer description."
      : definition ? ` ${definition.body}` : "";
    return `**${item.label} — ${period.label}**\n• Auth rate: **${pct(item.auth_rate)}**\n• Approved: **${count(item.approved_cnt)}**\n• Declined: **${count(declined)}**\n• Total attempts: **${count(item.total_cnt)}** (${pct(item.total_cnt / totalAttempts, 2)} of all attempts)\n\n${note}`;
  }

  const lines = items.map((i) => {
    const declined = Number(i.total_cnt) - Number(i.approved_cnt);
    return `• ${i.label}: **${pct(i.auth_rate)}** (${count(declined)} declined of ${count(i.total_cnt)})`;
  });
  rememberView(
    `Auth rate by entry method — ${period.label}`,
    items.map((item) => ({
      label: item.label,
      value: Number(item.auth_rate),
      display: pct(item.auth_rate),
      secondary: `${count(item.total_cnt)} attempts`,
    })),
    "Approval rates by terminal entry method."
  );
  return `**Auth rate by entry method — ${period.label}**\n${lines.join("\n")}\n\nAsk a follow-up like “What is Key entered?” or “Break down Other.”`;
}

function mixConfig(kind) {
  return {
    entry: { field: "entry_method_mix", title: "Entry method mix" },
    payment: { field: "payment_type_mix", title: "Payment type mix" },
    wallet: { field: "wallet_mix", title: "Wallet mix" },
  }[kind];
}

/** Keep chat wording identical to the chart legend. */
function mixLabel(label) {
  return typeof window.__mixLabel === "function" ? window.__mixLabel(label) : label;
}

function findMixItem(items, q) {
  return (items || []).find((item) => {
    const names = [item.label, mixLabel(item.label)];
    // "Android Pay (Google)" should answer to "Android Pay".
    const candidates = names
      .flatMap((name) => [name, String(name).replace(/\s*\([^)]*\)/g, "")])
      .map(normalize)
      .filter(Boolean);
    return candidates.some(
      (label) =>
        q.includes(label) ||
        label.split(" ").filter((w) => w.length > 3).every((w) => q.includes(w))
    );
  });
}

/** How many trailing weeks the question asked for, if it said. */
function requestedWeekCount(q) {
  const match = q.match(/\b(?:last|past|previous|trailing)\s+(\d{1,2})\s+weeks?\b/);
  if (match) return Math.max(2, Number(match[1]));
  return null;
}

/**
 * One mix row (Apple Pay, Contactless, Visa…) followed across the loaded weeks.
 * Every week carries its own mix array, so this is read, never interpolated.
 */
function answerMixItemTrend(kind, q, explicitKind = false) {
  const config = mixConfig(kind);
  const weeks = allWeeks();
  if (!config || weeks.length < 2) return null;

  const latestItems = currentPeriod()?.[config.field] || [];
  const selected = findMixItem(latestItems, q);
  if (!selected) return null;

  // "Other" style buckets match too loosely to claim a question on their own.
  if (!explicitKind && /^(other|card \/ other|other entry|unknown)$/i.test(selected.label)) {
    return null;
  }

  const wanted = requestedWeekCount(q);
  const window = wanted ? weeks.slice(-wanted) : weeks;
  const series = window
    .map((week) => {
      const row = (week[config.field] || []).find((item) => item.label === selected.label);
      return row ? { label: week.label, pct: Number(row.pct), count: Number(row.count) } : null;
    })
    .filter(Boolean);

  if (series.length < 2) {
    return `I only have one week of ${mixLabel(selected.label)} in the ${config.title.toLowerCase()}, so there isn’t a trend yet.`;
  }

  chatContext.topic = "mix";
  chatContext.mixKind = kind;

  const first = series[0];
  const last = series.at(-1);
  const changePts = (last.pct - first.pct) * 100;
  const direction =
    Math.abs(changePts) < 0.05 ? "held flat" : changePts > 0 ? "grew" : "shrank";
  const move =
    Math.abs(changePts) < 0.05
      ? "no change"
      : `${changePts > 0 ? "+" : "-"}${Math.abs(changePts).toFixed(2)} pts`;
  const points = series.map((point) => `${point.label}: **${pct(point.pct, 1)}**`).join("\n• ");
  const asked = wanted && wanted > weeks.length ? ` I only have ${weeks.length} loaded weeks.` : "";

  rememberView(
    `${mixLabel(selected.label)} share by week`,
    series.map((point) => ({
      label: point.label,
      value: point.pct,
      display: pct(point.pct, 1),
    })),
    `${mixLabel(selected.label)} ${direction} by ${move} across ${series.length} weeks.`
  );

  return `**${mixLabel(selected.label)} — ${config.title.toLowerCase()} by week**\n• ${points}\n\nIt **${direction}** over these ${series.length} weeks (**${move}**), from ${pct(first.pct, 1)} to ${pct(last.pct, 1)}. Latest week is **${count(last.count)} transactions**.${asked}`;
}

/** Try the named mix first, then the others, so "contactless trend" finds entry mix. */
function answerAnyMixItemTrend(q) {
  const named = detectMixKind(q);
  const order = named
    ? [named, ...["wallet", "entry", "payment"].filter((kind) => kind !== named)]
    : ["wallet", "entry", "payment"];
  for (const kind of order) {
    const answer = answerMixItemTrend(kind, q, kind === named);
    if (answer) return answer;
  }
  return null;
}

function answerMix(kind, q, forceCounts = false) {
  const period = currentPeriod();
  const config = mixConfig(kind);
  const items = period?.[config?.field] || [];
  if (!config || !items.length) return "That mix isn’t available for this period.";
  chatContext.topic = "mix";
  chatContext.mixKind = kind;

  const selected = findMixItem(items, q);
  if (selected) {
    rememberView(
      `${mixLabel(selected.label)} share`,
      [
        { label: mixLabel(selected.label), value: Number(selected.count), display: count(selected.count) },
        { label: "All other", value: Math.max(0, items.reduce((sum, item) => sum + Number(item.count || 0), 0) - Number(selected.count)), display: count(Math.max(0, items.reduce((sum, item) => sum + Number(item.count || 0), 0) - Number(selected.count))) },
      ],
      `${mixLabel(selected.label)}: ${pct(selected.pct, 1)}.`
    );
    return `For **${period.label}**, **${mixLabel(selected.label)}** represents **${pct(selected.pct, 1)}** of ${config.title.toLowerCase()} — **${count(selected.count)} transactions**.`;
  }

  const total = items.reduce((sum, i) => sum + Number(i.count || 0), 0);
  const lines = items.slice(0, 8).map((item) =>
    `• ${mixLabel(item.label)}: **${pct(item.pct, 1)}**${forceCounts ? ` (${count(item.count)})` : ""}`
  );
  rememberView(
    `${config.title} — ${period.label}`,
    items.slice(0, 8).map((item) => ({
      label: mixLabel(item.label),
      value: Number(item.count),
      display: pct(item.pct, 1),
      secondary: `${count(item.count)} transactions`,
    })),
    `Total: ${count(total)} transactions.`
  );
  return `**${config.title} — ${period.label}**\n${lines.join("\n")}\n${forceCounts ? `\nTotal: ${count(total)} transactions.` : "\nAsk “how many” to see counts."}`;
}

function answerDeclines(asPercent = false) {
  const period = currentPeriod();
  const reasons = period?.decline_reasons || [];
  if (!reasons.length) return "I don’t see decline-reason data for this period.";
  chatContext.topic = "declines";
  const knownTotal = reasons.reduce((sum, d) => sum + Number(d.count || 0), 0);
  const allDeclines = period.totals
    ? Number(period.totals.auth_total_cnt || 0) - Number(period.totals.auth_approved_cnt || 0)
    : knownTotal;
  const denominator = allDeclines || knownTotal;
  const lines = reasons.slice(0, 8).map((d, idx) =>
    `${idx + 1}. ${d.label}: **${asPercent ? pct(d.count / denominator, 1) : count(d.count)}**${asPercent ? ` (${count(d.count)})` : ""}`
  );
  rememberView(
    `Decline reasons — ${period.label}`,
    reasons.slice(0, 8).map((reason) => ({
      label: reason.label,
      value: Number(reason.count),
      display: asPercent ? pct(reason.count / denominator, 1) : count(reason.count),
      secondary: asPercent ? `${count(reason.count)} requests` : pct(reason.count / denominator, 1),
    })),
    `${count(allDeclines)} total declined authorization requests.`
  );
  const unnamed = Math.max(0, allDeclines - knownTotal);
  const note = asPercent && unnamed > 0
    ? `\n\n${count(unnamed)} declines have blank/unspecified reason text and are included in the percentage denominator.`
    : "";
  return `**Decline reasons — ${period.label}${asPercent ? " (% of declined requests)" : ""}**\n${lines.join("\n")}${note}`;
}

function answerComparison() {
  const period = currentPeriod();
  const prior = previousWeekFor(period);
  if (!period || !prior) return "Select a weekly period with a prior loaded week so I can compare them.";
  const keys = ["auth_rate", "decline_volume", "sales_volume", "downgrade_rate", "ic_fee", "returns_pct_of_sales"];
  const lines = keys.map((key) => {
    const meta = kpiMeta(key);
    const current = period.kpis[key]?.value;
    const previous = prior.kpis[key]?.value;
    if (current === undefined || previous === undefined) return null;
    const delta = current - previous;
    const direction = sentenceDirection(delta, Boolean(meta.invertDelta));
    return `• ${meta.label}: **${formatKpiValue(key, current)}** vs ${formatKpiValue(key, previous)} — ${direction} (${meta.formatDelta(delta)})`;
  }).filter(Boolean);
  chatContext.topic = "comparison";
  rememberView(
    `${period.label} vs ${prior.label}`,
    keys.map((key) => {
      const meta = kpiMeta(key);
      const current = period.kpis[key]?.value;
      const previous = prior.kpis[key]?.value;
      if (current === undefined || previous === undefined) return null;
      return {
        label: meta.label,
        value: Math.abs(current - previous),
        display: formatKpiValue(key, current),
        secondary: `prior ${formatKpiValue(key, previous)}`,
      };
    }),
    "Rows are ordered by leadership priority; changes use each metric's native unit."
  );
  return `**${period.label} vs ${prior.label}**\n${lines.join("\n")}`;
}

function answerAttention() {
  const period = currentPeriod();
  if (!period) return "No data is loaded yet.";
  const candidates = [
    { key: "auth_rate", priority: 1 },
    { key: "decline_volume", priority: 2 },
    { key: "sales_volume", priority: 3 },
    { key: "downgrade_rate", priority: 4 },
    { key: "ic_fee", priority: 5 },
    { key: "ic_rate", priority: 6 },
    { key: "returns_pct_of_sales", priority: 7 },
  ].map(({ key, priority }) => {
    const meta = kpiMeta(key);
    const obj = period.kpis[key];
    const delta = obj?.delta;
    const worsened = delta !== null && delta !== undefined &&
      (meta.invertDelta ? delta > 0 : delta < 0);
    return { key, priority, meta, obj, worsened, severity: worsened ? Math.abs(delta) : 0 };
  }).filter((x) => x.obj);

  const concerns = candidates.filter((x) => x.worsened).sort((a, b) => a.priority - b.priority);
  const top = concerns.length ? concerns.slice(0, 4) : candidates.slice(0, 3);
  const lines = top.map((x) =>
    `• **${x.meta.label}: ${formatKpiValue(x.key, x.obj.value)}** — ${x.worsened ? `moved the wrong way (${x.meta.formatDelta(x.obj.delta)})` : "stable / no adverse weekly move"}`
  );
  rememberView(
    `Leadership attention — ${period.label}`,
    top.map((item) => ({
      label: item.meta.label,
      value: Math.abs(Number(item.obj.delta || 0)),
      display: formatKpiValue(item.key, item.obj.value),
      secondary: item.worsened ? "adverse weekly move" : "stable",
    })),
    "Directional screen only; formal alert thresholds require leadership targets."
  );
  const headline = concerns.length
    ? `${concerns.length} leadership metric${concerns.length === 1 ? "" : "s"} moved adversely.`
    : "No priority metric moved adversely versus the prior week.";
  return `**What needs attention — ${period.label}**\n${headline}\n${lines.join("\n")}\n\nThis flags direction, not a formal alert threshold; targets still need to be agreed with Finance/Payments leadership.`;
}

function answerDerived(q) {
  const period = currentPeriod();
  if (!period) return null;
  const kpis = period.kpis || {};
  const totals = period.totals || {};

  if (/\b(decline|declined).*(percent|%|share).*(sales|revenue)|\b(percent|%).*(decline).*(sales|revenue)\b/.test(q)) {
    return `Declined authorization dollars are **${pct(kpis.decline_volume.value / kpis.sales_volume.value)} of sales volume** (${money(kpis.decline_volume.value)} ÷ ${money(kpis.sales_volume.value)}).`;
  }
  if (/\b(ic|interchange|fee).*(per transaction|per txn|each transaction)\b/.test(q)) {
    return `Interchange fees average **${money(kpis.ic_fee.value / kpis.transaction_volume.value, 2)} per sales transaction** (${money(kpis.ic_fee.value)} ÷ ${count(kpis.transaction_volume.value)}).`;
  }
  if (/\b(return|refund).*(dollar|amount|how much)\b/.test(q) && totals.return_amt !== undefined) {
    return `Return dollars are **${money(totals.return_amt)}**, equal to **${formatKpiValue("returns_pct_of_sales", kpis.returns_pct_of_sales.value)} of sales**.`;
  }
  if (/\b(approved|approval).*(count|how many)\b/.test(q) && totals.auth_approved_cnt !== undefined) {
    return `There were **${count(totals.auth_approved_cnt)} approved authorization requests** out of ${count(totals.auth_total_cnt)} attempts (${formatKpiValue("auth_rate", kpis.auth_rate.value)}).`;
  }
  return null;
}

function answerScope() {
  const state = getState();
  const scope = state?.data?.meta?.scope || "Company owned shops only";
  const channel = state?.data?.meta?.channel || "In Shop · Worldpay";
  return `This is **${channel}** (${scope}), with **${allWeeks().length} loaded weeks plus YTD**. Every tab uses the same company-owned footprint.`;
}

async function loadBenchmarks() {
  if (benchmarkData) return benchmarkData;
  try {
    const response = await fetch("data/benchmarks.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`benchmark file ${response.status}`);
    benchmarkData = await response.json();
    window.__benchmarkData = benchmarkData;
  } catch (error) {
    console.warn("Benchmark research is unavailable", error);
  }
  return benchmarkData;
}

function sourceLink(source) {
  if (!source?.url) return "";
  return `[${source.publisher || "Source"}](${source.url})`;
}

function answerIndustryBenchmark(q) {
  if (!benchmarkData) {
    return "The curated benchmark library has not loaded yet. Refresh the page and try again.";
  }
  const period = currentPeriod();
  chatContext.topic = "benchmark";
  const authRate = period?.kpis?.auth_rate?.value;
  const benchmarks = benchmarkData.payment_benchmarks || [];
  if (/\b(auth|approval|authorization)\b/.test(q) || !detectKpiKey(q)) {
    const qsr = benchmarks.find((item) => item.metric === "QSR authorization decline rate");
    const visa = benchmarks.find((item) => item.metric === "Card-present approval rate");
    const worldpay = benchmarks.find((item) => item.source?.publisher === "Worldpay");
    const current = authRate === undefined ? "" : `Dutch Bros In Shop is **${pct(authRate)}** for ${period.label}. `;
    return `**Directional authorization context**\n${current}Equifax/Kount reported a **4.06% authorization decline rate** for its QSR merchant cohort; Visa published **96% card-present approval** for its cited U.S. VisaNet period; Worldpay describes **97%+** as best-in-class for select verticals.\n\nCurrent performance looks strong directionally, but these are **not apples-to-apples targets**—channel, network, issuer mix, retries, de-duplication, and definitions differ.\n\nSources: ${sourceLink(qsr.source)} · ${sourceLink(visa.source)} · ${sourceLink(worldpay.source)}\nResearch updated: ${benchmarkData.updated_at}.`;
  }
  return "The public benchmark library currently has defensible context for authorization rate, not for interchange, downgrade, returns, AOV, or wallet mix. I won’t invent a standard where comparable definitions are unavailable.";
}

function answerCompetitor(q) {
  if (!benchmarkData) return "The curated competitor research has not loaded yet. Refresh and try again.";
  const competitors = benchmarkData.competitors || [];
  chatContext.topic = "competitor";
  const selected = competitors.filter((competitor) => q.includes(normalize(competitor.name)));
  const list = selected.length ? selected : competitors;
  const sections = list.map((competitor) => {
    const facts = competitor.public_context.map((fact) => `• ${fact}`).join("\n");
    const proxy = (competitor.payment_proxy || [])
      .map((item) => `• ${item.label}: **${item.value}** — ${item.note}`)
      .join("\n");
    const sources = competitor.sources.map(sourceLink).join(" · ");
    const proxyBlock = proxy ? `\nClosest payment-related proxy:\n${proxy}` : "";
    return `**${competitor.name}**\n${facts}${proxyBlock}\nSources: ${sources}`;
  });
  return `**Competitor research context**\n${sections.join("\n\n")}\n\nThese are public footprint, growth, and (for Starbucks) tender-mix facts—useful market context, not a like-for-like payment-performance benchmark against our Worldpay feed. Research updated: ${benchmarkData.updated_at}.`;
}

function answerDataQuality() {
  const quality = getState()?.data?.meta?.data_quality;
  chatContext.topic = "quality";
  if (!quality) {
    return "This dashboard predates the certification metadata. The new publish gate still runs schema, type, duplicate, reconciliation, anomaly, and copy-consistency checks before deployment.";
  }
  return `**Data certification**\n• Status: **${quality.status}**\n• Certified for publish: **${quality.certified ? "Yes" : "No"}**\n• Weeks checked: **${quality.weeks_checked}**\n• Warnings requiring review: **${quality.warning_count}**\n\nA failed hard check blocks GitHub Pages deployment. The gate checks required columns, numeric types, missing/negative/fractional measures, exact duplicates, Monday week dates, file pairing, auth-to-sales reconciliation, unusual weekly movement, KPI tests, and identical published JSON copies. Warnings do not alter data; they force review of unusual but potentially legitimate movement.`;
}

function latestPosWeek() {
  return (
    window.__posSales?.getSelectedWeek?.() ||
    window.__posSales?.getLatestWeek?.() ||
    window.__posSalesState?.latest ||
    null
  );
}

function answerPosTender(q = "") {
  const week = latestPosWeek();
  chatContext.topic = "pos";
  if (!week) {
    return "All payments data isn’t published yet. Import the Snowflake export with `python3 scripts/import_pos_sales.py <path>` (or attach the JSON here) and I’ll answer tender-mix questions.";
  }
  const wantCash = /\bcash\b/.test(q);
  const wantGift = /\bgift card|dutch pass\b/.test(q);
  const wantCard = /\bcard\b/.test(q) && !wantGift;
  const selected = week.tenders.find((tender) => {
    const label = normalize(tender.label);
    if (wantGift) return label.includes("gift") || label.includes("dutch");
    if (wantCash) return label.includes("cash");
    if (wantCard) return label === "card";
    return false;
  });
  if (selected) {
    rememberView(
      `${selected.label} — ${week.label}`,
      week.tenders.map((tender) => ({
        label: tender.label,
        value: Number(tender.amount),
        display: money(tender.amount, 2),
        secondary: pct(tender.pct, 1),
      })),
      `${selected.label}: ${money(selected.amount, 2)} (${pct(selected.pct, 1)} of POS sales).`
    );
    return `For **${week.label}**, **${selected.label}** was **${money(selected.amount, 2)}** — **${pct(selected.pct, 1)}** of In Shop All payments.`;
  }

  const lines = week.tenders.map(
    (tender) => `• ${tender.label}: **${money(tender.amount, 2)}** (${pct(tender.pct, 1)})`
  );
  rememberView(
    `POS tender mix — ${week.label}`,
    week.tenders.map((tender) => ({
      label: tender.label,
      value: Number(tender.amount),
      display: money(tender.amount, 2),
      secondary: pct(tender.pct, 1),
    })),
    `Total POS sales: ${money(week.tenderTotal, 2)}.`
  );
  return `**In Shop · All payments tender mix — ${week.label}**\n${lines.join("\n")}\n\nTotal: **${money(week.tenderTotal, 2)}**.`;
}

function answerPosCoverage() {
  chatContext.topic = "pos";
  return "Every channel on this dashboard is **company-owned shops only**. Shop_Type_Mapping.xlsx is the CO/Legacy authority. Non-CO stands are filtered out so POS, Worldpay, and future feeds stay on the same footprint.";
}

function ticketBasisLabel(week) {
  const basis = week?.avgTicketBasis || week?.ticketBasis;
  if (basis === "distinct_ORDER_ID" || basis === "orders") return "sales ÷ distinct ORDER_ID (guest checks)";
  if (basis === "payment_lines" || basis === "TRANSACTION_COUNT") return "sales ÷ payment lines";
  // Published weeks before the rebuild omit the basis field and use payment lines.
  return "sales ÷ payment lines (current published basis)";
}

function answerPosAvgTicket() {
  const week = latestPosWeek();
  chatContext.topic = "pos";
  if (!week || week.avgTicket == null) {
    return `**AVG_TICKET (All payments)** — Xenial sales dollars divided by the published ticket basis. Current published weeks use **sales ÷ payment lines**. A later rebuild will switch to **sales ÷ distinct ORDER_ID** and publish \`AVG_TICKET_BASIS = distinct_ORDER_ID\`. Older weeks keep their original basis until rebuilt. This is all tenders — not card-only, and not Worldpay.`;
  }
  return `For **${week.label}**, All payments **AVG_TICKET** is **$${Number(week.avgTicket).toFixed(2)}** (${ticketBasisLabel(week)}).\n\nThis is Xenial sales across Card + Cash + Gift Card / Dutch Pass — not card-only and not Worldpay. Worldpay AOV stays higher because networks authorize **sale + tip**.`;
}

function answerPosPaymentsCount() {
  const week = latestPosWeek();
  chatContext.topic = "pos";
  if (!week || week.transactions == null) {
    return "**TRANSACTION_COUNT** is the count of Xenial payment **lines** after `SYS_HASH` dedupe. Two tenders on one guest check count as two lines. It is not distinct `ORDER_ID`.";
  }
  return `For **${week.label}**, All payments recorded **${Number(week.transactions).toLocaleString("en-US")}** payment lines (\`TRANSACTION_COUNT\` after \`SYS_HASH\` dedupe).\n\nTwo tenders on one guest check count as two lines. Distinct guest checks (\`ORDER_COUNT\`) are not published in these weeks yet.`;
}

function answerPosOrderCount() {
  const week = latestPosWeek();
  chatContext.topic = "pos";
  if (week?.orderCount != null) {
    return `For **${week.label}**, All payments recorded **${Number(week.orderCount).toLocaleString("en-US")}** guest checks (\`ORDER_COUNT\` = distinct \`ORDER_ID\`).`;
  }
  return "**ORDER_COUNT** (distinct guest checks / \`ORDER_ID\`) is **not published** in the current All payments weeks. Today’s totals expose payment **lines** only. \`ORDER_COUNT\` arrives with the AVG_TICKET rebuild that switches the average to sales ÷ orders.";
}

function answerPosTipsOrChange(q) {
  chatContext.topic = "pos";
  const aboutTips = /\btips?|gratuity\b/.test(q);
  const aboutChange = /\bchange|cash back\b/.test(q);
  if (aboutTips && !aboutChange) {
    return "Tips are excluded from All payments **SALES_VOLUME** because they are not drink sales. Card networks still authorize **sale + tip**, so Worldpay average ticket (about **$12.15** last week on chain `0OS957`) stays higher than the Xenial sales ticket. Do not force the two averages to match.";
  }
  if (aboutChange && !aboutTips) {
    return "Change is cash handed back to the guest, not sales. It is excluded from All payments **SALES_VOLUME** and never appears on Worldpay.";
  }
  return "All payments excludes **tips** and **change**. Tips are not drink sales; change is cash handed back. Worldpay still sees authorized **sale + tip**, which is why its average ticket sits above the Xenial sales ticket.";
}

function answerPosWorldpayTicketGap() {
  chatContext.topic = "pos";
  const week = latestPosWeek();
  const posTicket =
    week?.avgTicket != null ? `All payments AVG_TICKET for **${week.label}** is **$${Number(week.avgTicket).toFixed(2)}** (${ticketBasisLabel(week)}). ` : "";
  const worldpay = currentPeriod()?.kpis?.aov?.value;
  const wpTicket =
    worldpay != null ? `Card present AOV for the selected Worldpay period is **${formatKpiValue("aov", worldpay)}**. ` : "";
  return `${posTicket}${wpTicket}They are not the same metric. All payments is Xenial drink/tender sales with tips and change removed. Worldpay authorizes **sale + tip**, so its average stays higher (about **$12.15** last week on chain \`0OS957\`). Do not force them to match.`;
}

function answerPosSource() {
  chatContext.topic = "pos";
  return "**All payments** is Xenial POS tender mix from \`SILVER_CLEANSED.XENIAL_BULK.ORDER_DETAILS_FEED\`, limited to company-owned shops via \`Shop_Type_Mapping.xlsx\` (\`STAND_NUMBER\` = \`NewCoID #\`). Weeks are completed Monday–Sunday on \`BUSINESS_DATE\`. Sales are net CO payment dollars after \`SYS_HASH\` dedupe — refunds negative, tips/change out, lines over $10k dropped, no Legacy/unmapped shops, no CHECK/UNKNOWN.";
}

function answerPosNotInKpi(q) {
  chatContext.topic = "pos";
  if (/\bapple pay|google pay|samsung pay|android pay|wallet\b/.test(q)) {
    return "Apple Pay / Google Pay / Samsung Pay do **not** appear as their own buckets in All payments. Those wallets show clearly on **Card present** (Worldpay). In Xenial they typically land inside \`CREDIT\` when present at all.";
  }
  if (/\btax|discount|item|category|quantity\b/.test(q)) {
    return "Item names/categories, quantities, taxes, and discounts sit on the Xenial table but are **not** in this All payments KPI. The published mix is Card / Cash / Gift Card · Dutch Pass only.";
  }
  return "All payments publishes Card / Cash / Gift Card · Dutch Pass only. Item mix, taxes, discounts, and mobile-wallet brand detail are not in this KPI — wallets show on Card present (Worldpay).";
}

function answerPosExclusions() {
  chatContext.topic = "pos";
  return [
    "**What is excluded from All payments (Xenial)**",
    "• **Tips** — not drink sales. Card networks still authorize sale + tip, so Worldpay average ticket stays higher.",
    "• **Change** — cash handed back to the guest, not sales. Never appears on Worldpay.",
    "• **Payment lines over $10k** — dropped as bad data. The filter is any line over $10k, not cash-only.",
    "• **Legacy and unmapped shops** — company-owned only, per `Shop_Type_Mapping.xlsx`.",
    "• **CHECK and UNKNOWN payment types** — left out of the tender mix.",
    "• **Duplicate payment rows** — deduped on `SYS_HASH`. `TRANSACTION_ID` is not unique, so it is never used to dedupe.",
    "",
    "**Kept, not excluded:** refunds stay in as **negative** dollars, so sales are net.",
    "",
    "**On the Xenial table but not in this KPI:** item names/categories, quantities, taxes, and discounts (about **$8.5M** company-wide item + order discounts in the week of 8/10). Apple / Google / Samsung Pay are not broken out here — those show on **Card present** (Worldpay).",
    "",
    "Ask **“What are the assumptions?”** for the judgement calls behind these rules.",
  ].join("\n");
}

function answerPosAssumptions() {
  chatContext.topic = "pos";
  return [
    "**Assumptions behind All payments (Xenial)** — each of these is a judgement call, not a fact from the source system:",
    "• `Shop_Type_Mapping.xlsx` is treated as the **authority** on which shops are company-owned vs Legacy. Join is `STAND_NUMBER` = column B (`NewCoID #`); that file's headers are swapped versus its values.",
    "• The **$10k** filter drops **any** payment line over $10k, not just cash lines.",
    "• **Card** = all `CREDIT`. There is no debit split, and Visa/MC/Amex/Discover brand mix is not published here (`CREDIT_CARD_TYPE` exists but is blank on many rows).",
    "• **`CUSTOM` is the only Dutch Pass mapping** — Dutch Pass is the window wallet scan, grouped with `GIFT` into one tender bucket.",
    "• Worldpay chain **`0OS957`** is **not confirmed** to cover the same shop list as the company-owned footprint, so Card present and All payments totals are not guaranteed to reconcile shop-for-shop.",
    "• Weeks are completed **Monday–Sunday** on `BUSINESS_DATE`.",
    "• `AVG_TICKET` basis can differ by week: published weeks use sales ÷ payment lines, and older weeks keep that basis until they are rebuilt on distinct orders.",
    "",
    "Ask **“Explain the exclusions in the data”** for what gets filtered out before these numbers.",
  ].join("\n");
}

function answerPosAvgTicketChange() {
  chatContext.topic = "pos";
  return "Yes — for the next published build, **AVG_TICKET** moves from **sales ÷ payment lines** to **sales ÷ distinct ORDER_ID** (guest checks), and the file will carry \`AVG_TICKET_BASIS = distinct_ORDER_ID\` plus \`ORDER_COUNT\`. \`TRANSACTION_COUNT\` stays payment lines. Older weeks already in the rolling file keep their original average until rebuilt.";
}

function isPosSalesTab() {
  if (chatContext.activeTab === "pos") return true;
  try {
    return document.querySelector?.(".tab[data-tab].active")?.dataset?.tab === "pos";
  } catch (_) {
    return false;
  }
}

function wantsPosKnowledge(q) {
  if (
    /\b(all payments|xenial|tender mix|guest checks?|payment lines|dutch pass|shop type mapping|order details feed)\b/.test(
      q
    )
  ) {
    return true;
  }
  if (/\b(avg[_\s]?ticket|order[_\s]?count|transaction[_\s]?count|avg ticket basis)\b/.test(q)) {
    return true;
  }
  if (/\bpos\b/.test(q)) return true;
  if (chatContext.topic === "pos") return true;
  return isPosSalesTab();
}

function answerQuestion(raw) {
  const q = normalize(raw);
  if (!q) return "Ask me to explain a metric, build a trend, compare weeks, or convert a number to a percentage.";

  const format = detectFormatRequest(q);
  if (format) return formatRememberedView(format);

  if (/^(hi|hello|hey|good morning|good afternoon)\b/.test(q) || q === "help" || q.includes("what can you do")) {
    return `Good morning! I’m on **every channel tab** and can:\n• Explain **Card present (Worldpay)** trends and best/worst weeks\n• Answer **All payments (Xenial)** tender mix, AVG_TICKET basis, and why Worldpay ticket differs\n• List the **exclusions** (tips, change, $10k lines, Legacy shops) and the **assumptions** behind them\n• **Compare** weeks and reformat answers as tables or bars\n• Explain payment **definitions**\n• Give cited **QSR / payment industry benchmarks**\n• Research public facts about **Starbucks, Dunkin, and 7 Brew**\n• Explain the dashboard's **data certification status**`;
  }

  // Anyone about to share these numbers should be able to ask what was left out.
  // A question that names one item ("why are tips excluded") gets the specific
  // answer further down instead of this whole-list one.
  const namesOneExclusion =
    /\b(tips?|gratuity|change|cash back|apple pay|google pay|samsung pay|android pay|wallet|discounts?|taxes|tax|items?|categor|quantit|refunds?|legacy|franchise)\b/.test(
      q
    );
  if (
    !namesOneExclusion &&
    (/\bexclusions?\b|\bexclud/.test(q) ||
      /\b(filtered out|filter out|left out|leave out|not include|doesn't include|does not include|removed from|dropped from)\b/.test(q))
  ) {
    return answerPosExclusions();
  }
  if (
    /\b(assumptions?|assumed|caveats?|limitations?|gotchas?|footnotes?|fine print)\b/.test(q) ||
    /\b(what should i know|need to know|before (i )?shar)\b/.test(q)
  ) {
    return answerPosAssumptions();
  }

  if (/\b(scope|company owned|what data|what am i looking)\b/.test(q)) return answerScope();
  if (/\b(data quality|certified|certification|sanity check|validated|validation|accurate)\b/.test(q)) return answerDataQuality();
  if (/\b(starbucks|dunkin|7 brew|7brew|competitor|competition|peer)\b/.test(q)) return answerCompetitor(q.replace("7brew", "7 brew"));
  if (/\b(industry standards?|industry benchmarks?|qsr benchmarks?|coffee chain benchmarks?|restaurant benchmarks?|benchmarks?)\b/.test(q)) return answerIndustryBenchmark(q);

  // Xenial / All payments knowledge before Worldpay KPI aliases steal "average ticket" / "transaction count".
  if (
    /\b(where does|where do|source|comes from|come from|xenial|order details feed|shop type mapping)\b/.test(q) &&
    /\b(all payments|pos|tender|xenial|data)\b/.test(q)
  ) {
    return answerPosSource();
  }
  if (
    /\b(why|higher|differ|difference|gap|vs|versus|compared)\b/.test(q) &&
    /\b(worldpay|card present)\b/.test(q) &&
    /\b(avg|average|ticket|aov|pos|all payments|xenial)\b/.test(q)
  ) {
    return answerPosWorldpayTicketGap();
  }
  if (
    /\b(tips?|gratuity|change|cash back)\b/.test(q) &&
    /\b(exclud|left out|removed|why|not (in|on)|all payments|pos|sales volume|sales)\b/.test(q)
  ) {
    return answerPosTipsOrChange(q);
  }
  if (
    /\b(will|next week|later|rebuild|change|switch)\b/.test(q) &&
    /\b(avg[_\s]?ticket|average ticket|ticket basis|order[_\s]?count|distinct order)\b/.test(q)
  ) {
    return answerPosAvgTicketChange();
  }
  if (/\b(order[_\s]?count|guest checks?|distinct orders?|how many (orders|checks|guest))\b/.test(q)) {
    return answerPosOrderCount();
  }
  if (
    /\b(avg[_\s]?ticket|average ticket|avg payment|average payment|average check)\b/.test(q) &&
    !/\b(aov|average order)\b/.test(q)
  ) {
    // AVG_TICKET is the All payments metric. Worldpay uses AOV (sale + tip).
    const explicitWorldpayOnly =
      /\b(worldpay|card present)\b/.test(q) && !/\b(all payments|xenial|pos)\b/.test(q);
    if (!explicitWorldpayOnly && (wantsPosKnowledge(q) || isDefinitionIntent(q) || isPosSalesTab())) {
      return answerPosAvgTicket();
    }
  }
  if (
    /\b(transaction[_\s]?count|payment lines)\b/.test(q) ||
    (/\b(how many payments|payments count)\b/.test(q) && wantsPosKnowledge(q))
  ) {
    return answerPosPaymentsCount();
  }
  if (
    /\b(apple pay|google pay|samsung pay|android pay|item (name|mix|categor)|taxes?|discounts?)\b/.test(q) &&
    (wantsPosKnowledge(q) ||
      /\b(all payments|tender mix|xenial|left out)\b|\bexclud|\bnot includ|\bincluded\b/.test(q))
  ) {
    return answerPosNotInKpi(q);
  }
  if (/\brefunds?\b/.test(q) && (/\bexclud|\binclud|\bnegative\b|\bfiltered\b|\bleft out\b/.test(q))) {
    chatContext.topic = "pos";
    return "Refunds are **not excluded** from All payments — they stay in as **negative** dollars, so `SALES_VOLUME` is net. Tips, change, and payment lines over $10k are what get dropped.";
  }

  // "Trend of Apple Pay over the last 4 weeks" asks for a series, not a definition,
  // so it has to be answered before the glossary claims "wallet mix".
  if (/\b(trend|trending|over time|by week|week by week|over the last|over the past|history|trajectory|changed|changing|growing|declining)\b/.test(q)) {
    const mixTrend = answerAnyMixItemTrend(q);
    if (mixTrend) return mixTrend;
  }

  // Definitions before POS routing so "What is cash?" / "What is POS sales?" stay definitional.
  const earlyDef = findDefinition(q);
  if (isDefinitionIntent(q) && earlyDef) {
    if (earlyDef.title === "Key entered" && currentPeriod()?.auth_rate_by_entry) {
      const detail = answerEntryAuth("key entered", "Key entered").replace(
        /\n\n A card number[\s\S]*$/,
        ""
      );
      return `**Key entered** — ${earlyDef.body}\n\n**Current period:**\n${detail}`;
    }
    return `**${earlyDef.title}** — ${earlyDef.body}`;
  }

  if (/\b(missing shops?|shop coverage|legacy.?co mapping|mapping extract|shops? (?:are |were )?missing|missing from the mapping|non[- ]?company[- ]?owned|franchise)\b/.test(q) ||
      (/\bmissing\b/.test(q) && /\b(shops?|stands?|mapping)\b/.test(q))) {
    return answerPosCoverage();
  }
  if (/\b(pos sales|pos tender|tender mix|dutch pass|gift card)\b/.test(q) ||
      (/\b(cash|card)\b/.test(q) && /\b(pos|tender|mix|share|percent|%)\b/.test(q)) ||
      (chatContext.topic === "pos" && /\b(cash|card|gift|dutch pass|mix|percent|%)\b/.test(q))) {
    return answerPosTender(q);
  }
  if (/\b(what needs attention|need attention|critical|biggest concern|leadership summary|executive summary)\b/.test(q)) return answerAttention();
  if (/\b(compare|versus|vs|prior week|last week|week over week|wow)\b/.test(q) && !detectKpiKey(q)) return answerComparison();

  const derived = answerDerived(q);
  if (derived) return derived;

  const entryLabel = detectEntryLabel(q);
  const explicitEntryAuth = /\b(auth|authorization|approval) rate by entry\b|\bentry method auth\b/.test(q);
  const entryFollowUp = chatContext.topic === "auth_entry" &&
    (entryLabel || /\b(breakdown|details|what about|how about|how many|percent)\b/.test(q));
  if (explicitEntryAuth) return answerEntryAuth(q, entryLabel);

  const def = findDefinition(q);
  if (isDefinitionIntent(q) && def) {
    if (def.title === "Key entered" && currentPeriod()?.auth_rate_by_entry) {
      const detail = answerEntryAuth("key entered", "Key entered")
        .replace(/\n\n A card number[\s\S]*$/, "");
      return `**Key entered** — ${def.body}\n\n**Current period:**\n${detail}`;
    }
    return `**${def.title}** — ${def.body}`;
  }
  if (entryFollowUp) return answerEntryAuth(q, entryLabel);

  if (/\b(decline reasons?|top declines?|why.*declin|declines as|decline breakdown)\b/.test(q) ||
      (chatContext.topic === "declines" && /\b(percent|percentage|percentages|%|count|number)\b/.test(q))) {
    return answerDeclines(/\b(percent|percentage|percentages|%|share|rate)\b/.test(q));
  }

  let mixKind = detectMixKind(q);
  if (!mixKind && chatContext.topic === "mix" && /\b(how many|percent|%|what about|breakdown)\b/.test(q)) {
    mixKind = chatContext.mixKind;
  }
  if (mixKind) return answerMix(mixKind, q, /\b(how many|count|number)\b/.test(q));

  let key = detectKpiKey(q);
  if (!key && chatContext.kpiKey && /\b(it|this|that|the metric|trend)\b/.test(q)) key = chatContext.kpiKey;
  const wantsTrend = /\b(trend|over time|best week|worst week|direction|moving)\b/.test(q);
  if (wantsTrend && key) return answerTrend(key);
  if (wantsTrend && !key) return answerTrendSummary();
  if (key) return answerKpi(key);

  if (isDefinitionIntent(q) && def) return `**${def.title}** — ${def.body}`;
  return OFF_TOPIC_REPLIES[Math.floor(Math.random() * OFF_TOPIC_REPLIES.length)];
}

function appendMessage(role, text) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>')
    .replace(/\n/g, "<br>");
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

function suggestedFollowUps() {
  const commonFormats = [
    { label: "Want to see this in a quick table?", question: "Show that as a table" },
    { label: "Would a visual comparison help?", question: "Show that as visual bars" },
  ];
  const byTopic = {
    pos: [
      { label: "Want the cash share specifically?", question: "What share of POS sales was cash?" },
      { label: "Want gift card / Dutch Pass next?", question: "What share of POS sales was Gift Card / Dutch Pass?" },
      { label: "Want this as a table?", question: "Show that as a table" },
    ],
    auth_entry: [
      { label: "Curious why keyed transactions approve less often?", question: "What is key entered?" },
      { label: "Want to compare entry methods side by side?", question: "Show that as visual bars" },
    ],
    declines: [
      { label: "Want to see each decline reason as a percentage?", question: "Show decline reasons as percentages" },
      { label: "How much sales volume sits behind those declines?", question: "What percent are decline dollars of sales?" },
    ],
    trend: [
      { label: "Want the week-by-week numbers in a table?", question: "Show that as a table" },
      { label: "Which movement deserves leadership’s attention?", question: "Which metrics need attention?" },
    ],
    comparison: [
      { label: "Want the quick leadership takeaway?", question: "Summarize that for an executive" },
      { label: "What story is the auth-rate trend telling?", question: "Explain the auth rate trend" },
    ],
    mix: [
      { label: "Want the transaction counts behind the percentages?", question: "Show that as a table" },
      { label: "Which wallets are guests reaching for?", question: "Show wallet mix" },
    ],
    benchmark: [
      { label: "What do our competitors actually disclose?", question: "Compare us with Starbucks, Dunkin, and 7 Brew" },
      { label: "How confidently can we use this benchmark?", question: "What makes the benchmark directional?" },
    ],
    competitor: [
      { label: "How does our auth rate stack up to QSR context?", question: "How does our auth rate compare with industry benchmarks?" },
      { label: "Which competitor payment metrics are truly public?", question: "Which competitor payment KPIs are public?" },
    ],
    quality: [
      { label: "What gets checked before these numbers go live?", question: "What data sanity checks run before publish?" },
      { label: "How did this week move versus last week?", question: "Compare this week with the prior week" },
    ],
    kpi: commonFormats,
  };
  return (byTopic[chatContext.topic] || commonFormats).slice(0, 2);
}

function appendFollowUps(input) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  const row = document.createElement("div");
  row.className = "chat-followups";
  for (const suggestion of suggestedFollowUps()) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = suggestion.label;
    button.addEventListener("click", () => submitQuestion(suggestion.question, input));
    row.appendChild(button);
  }
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

function submitQuestion(text, input) {
  const value = String(text || "").trim();
  if (!value) return;
  appendMessage("user", value);
  if (input) input.value = "";
  const reply = answerQuestion(value);
  setTimeout(() => {
    appendMessage("bot", reply);
    appendFollowUps(input);
  }, 100);
}

const TAB_PROMPTS = {
  pos: [
    { question: "Show the POS tender mix", label: "How did guests pay in shop?" },
    { question: "What is AVG_TICKET on All payments?", label: "What does AVG_TICKET mean?" },
    { question: "Explain the exclusions in the data", label: "What’s excluded from these numbers?" },
    { question: "What are the assumptions?", label: "What assumptions did we make?" },
    { question: "How does our auth rate compare with industry benchmarks?", label: "How does our auth rate stack up?" },
    { question: "Is this data certified?", label: "Has this data passed its quality checks?" },
  ],
  worldpay: [
    { question: "Which metrics need attention?", label: "What’s brewing in this week’s metrics?" },
    { question: "Show the POS tender mix", label: "How did guests pay in shop?" },
    { question: "How does our auth rate compare with industry benchmarks?", label: "How does our auth rate stack up?" },
    { question: "What competitor research is available for Starbucks, Dunkin, and 7 Brew?", label: "What can our competitors teach us?" },
    { question: "Is this data certified?", label: "Has this data passed its quality checks?" },
  ],
};

function refreshTabPrompts(tabId) {
  const wrap = document.querySelector(".ask-data-prompts");
  const blurb = document.getElementById("ask-data-blurb");
  const input = document.getElementById("chat-input");
  if (!wrap) return;
  const prompts = TAB_PROMPTS[tabId] || TAB_PROMPTS.worldpay;
  wrap.innerHTML = "";
  for (const prompt of prompts) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.question = prompt.question;
    button.textContent = prompt.label;
    button.addEventListener("click", () => submitQuestion(prompt.question, input));
    wrap.appendChild(button);
  }
  if (blurb) {
    blurb.textContent =
      tabId === "pos"
        ? "Ask about All payments tender mix, AVG_TICKET basis, tips/change, and why Worldpay differs — available on every tab"
        : "Ask about Card present trends, All payments definitions, industry benchmarks, and competitor research — available on every tab";
  }
}

async function initChatbot() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  if (!form || !input) return;
  await loadBenchmarks();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuestion(input.value, input);
  });

  document.querySelectorAll("[data-question]").forEach((button) => {
    button.addEventListener("click", () => submitQuestion(button.dataset.question, input));
  });

  window.addEventListener("dashboard:tab", (event) => {
    const tabId = event.detail?.tabId || "pos";
    chatContext.activeTab = tabId;
    refreshTabPrompts(tabId);
  });
  const activeTab = document.querySelector(".tab[data-tab].active");
  chatContext.activeTab = activeTab?.dataset.tab || "pos";
  refreshTabPrompts(chatContext.activeTab);

  appendMessage(
    "bot",
    "Hey there—I’m available on **every tab**. I can explain **Card present (Worldpay)** KPIs, **All payments (Xenial)** tender mix and ticket definitions, the **exclusions and assumptions** behind the numbers, cited **QSR/payment industry benchmarks**, public **competitor** research (Starbucks, Dunkin, 7 Brew), or this week’s **data certification**."
  );
  appendFollowUps(input);
}

function startChatbotWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    initChatbot();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => initChatbot(), { once: true });
}

window.__paymentsChat = { answerQuestion, normalize, chatContext };
document.addEventListener("DOMContentLoaded", startChatbotWhenUnlocked);
})();
