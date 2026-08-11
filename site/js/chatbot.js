/* Data-only assistant: answers from dashboard.json + payment definitions. */

const PAYMENT_DEFINITIONS = [
  {
    terms: ["auth rate", "authorization rate", "approval rate"],
    title: "Auth rate",
    body: "Share of authorization requests that were approved (response code 00) out of all auth requests in the period.",
  },
  {
    terms: ["aov", "average order value"],
    title: "AOV (Average Order Value)",
    body: "Sales dollars divided by sales transaction count for the period (from Interchange SALE rows).",
  },
  {
    terms: ["returns as % of sales", "return rate", "refund rate", "returns"],
    title: "Returns as % of sales",
    body: "Return/refund dollars divided by sales dollars for the period.",
  },
  {
    terms: ["sales volume", "sales $", "sales dollars"],
    title: "Sales volume",
    body: "Total SALE transaction amount from the Worldpay Interchange report.",
  },
  {
    terms: ["transaction volume", "txn volume", "transaction count"],
    title: "Transaction volume",
    body: "Total SALE transaction count from the Worldpay Interchange report.",
  },
  {
    terms: ["ic rate", "interchange rate", "interchange"],
    title: "IC rate (Interchange rate)",
    body: "Interchange fees divided by sales dollars for SALE transactions. This is interchange-only, not the full cost of acceptance.",
  },
  {
    terms: ["decline $", "decline dollars", "decline volume", "declined dollars"],
    title: "Decline $",
    body: "Total authorization dollars that were not approved (response code not 00). Puts a dollar figure on declined tickets.",
  },
  {
    terms: ["ic fee", "interchange fee", "ic fee $"],
    title: "IC fee $",
    body: "Total interchange fees in dollars for SALE transactions in the period.",
  },
  {
    terms: ["downgrade rate", "downgrade", "surcharge rate"],
    title: "Downgrade rate",
    body: "Share of sales dollars that carried a Worldpay surcharge / downgrade reason (for example missing Level 2 data).",
  },
  {
    terms: ["wallet mix", "apple pay", "google pay", "samsung pay", "wallet"],
    title: "Wallet mix",
    body: "Share of sales transactions by mobile wallet (Apple Pay, Google Pay, Samsung Pay, etc.) versus card / other.",
  },
  {
    terms: ["auth rate by entry", "entry method auth"],
    title: "Auth rate by entry method",
    body: "Approval rate broken out by how the card was presented (Contactless, Chip/Dip, Swipe, Key entered).",
  },
  {
    terms: ["entry method", "entry mode", "contactless", "chip", "dip", "swipe"],
    title: "Entry method",
    body: "How the card was presented: Contactless (tap), Chip/Dip, Swipe (magstripe), or Key entered.",
  },
  {
    terms: ["payment type", "card brand", "visa", "mastercard", "amex", "discover"],
    title: "Payment type",
    body: "Card brand mix of sales (Visa, Mastercard, Discover, Amex).",
  },
  {
    terms: ["decline", "decline reason", "do not honor"],
    title: "Decline reasons",
    body: "Authorization responses that were not approved, grouped by the bank/network response message.",
  },
  {
    terms: ["ytd", "year to date"],
    title: "YTD",
    body: "Year-to-date aggregates all loaded weeks in the current calendar year.",
  },
  {
    terms: ["worldpay", "in shop", "company owned"],
    title: "In Shop · Worldpay scope",
    body: "This dashboard covers company-owned physical shops processed through Worldpay. Other channels (Olo Pay, Gift Cards) are coming later.",
  },
  {
    terms: ["chargeback", "chargebacks"],
    title: "Chargebacks",
    body: "Disputed transactions. Not in this dashboard yet — shown as Coming soon until a chargeback feed is added.",
  },
  {
    terms: ["latency", "authorization latency"],
    title: "Authorization latency",
    body: "How long approvals/declines take to return. Not in the weekly files yet — Coming soon (monthly latency report).",
  },
  {
    terms: ["false decline", "retry"],
    title: "False decline / retry",
    body: "Cases where a decline is followed by a successful retry. Needs transaction-level data — Coming soon.",
  },
];

const OFF_TOPIC_REPLIES = [
  "I only speak fluent payments. Ask me about auth rates, IC, declines, or what AOV means — not weekend brunch plans.",
  "Cute question! But my uniform says ‘Worldpay data only.’ Try asking about sales volume or return rate.",
  "I’m contractually obligated (by this webpage) to dodge anything that isn’t dashboard data or payment definitions. Hit me with an IC rate question!",
  "If it’s not in these In Shop numbers or a payments glossary term, I’m just a friendly brick wall with jokes.",
  "I left my crystal ball at the drive-thru. I can tell you about Visa mix or declines though!",
];

const HELP_TEXT =
  "Ask things like: “What’s the auth rate?”, “Define IC rate”, “Top decline reasons”, “Entry method mix”, or “How did sales change week over week?”";

function getState() {
  return window.__dashboardState || null;
}

function currentPeriod() {
  const state = getState();
  if (!state?.data) return null;
  const id = state.periodId;
  if (id === "ytd") return state.data.periods.ytd;
  return state.data.periods.weeks.find((w) => w.id === id) || state.data.periods.weeks.at(-1);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9%\s./-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatKpiValue(key, value) {
  const meta = (window.KPI_ORDER || []).find((k) => k.key === key);
  if (meta) return meta.format(value);
  if (key.includes("rate") || key.includes("pct")) return `${(value * 100).toFixed(2)}%`;
  return String(value);
}

function formatDelta(key, delta) {
  if (delta === null || delta === undefined) return "no prior-week comparison for this period";
  const meta = (window.KPI_ORDER || []).find((k) => k.key === key);
  if (meta) {
    const arrow = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    return `${arrow} ${meta.formatDelta(delta)} vs prior week`;
  }
  return `delta ${delta}`;
}

function findDefinition(q) {
  let best = null;
  let bestScore = 0;
  for (const def of PAYMENT_DEFINITIONS) {
    for (const term of def.terms) {
      if (q.includes(term) && term.length >= bestScore) {
        best = def;
        bestScore = term.length;
      }
    }
  }
  return best;
}

function detectKpiKey(q) {
  const map = [
    { key: "auth_rate", needles: ["auth rate", "authorization rate", "approval rate", "approve rate"] },
    { key: "aov", needles: ["aov", "average order"] },
    {
      key: "returns_pct_of_sales",
      needles: ["returns as %", "return rate", "refund rate", "returns %", "return %"],
    },
    { key: "sales_volume", needles: ["sales volume", "sales $", "sales dollars", "revenue"] },
    {
      key: "transaction_volume",
      needles: ["transaction volume", "txn volume", "transaction count", "how many transactions"],
    },
    { key: "ic_rate", needles: ["ic rate", "interchange rate", "interchange %"] },
    { key: "decline_volume", needles: ["decline $", "decline dollars", "decline volume", "declined dollars"] },
    { key: "ic_fee", needles: ["ic fee", "interchange fee"] },
    { key: "downgrade_rate", needles: ["downgrade rate", "downgrade", "surcharge rate"] },
  ];
  for (const item of map) {
    if (item.needles.some((n) => q.includes(n))) return item.key;
  }
  return null;
}

function isDefinitionIntent(q) {
  if (/\b(define|definition|meaning|explain)\b/.test(q)) return true;
  if (/\bwhat does .+ mean\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) (an? )?ic rate\b/.test(q) && !/\bthe ic rate\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) (an? )?aov\b/.test(q) && !/\bthe aov\b/.test(q)) return true;
  if (/\bwhat(?:'s| is) auth rate\b/.test(q)) return true;
  return false;
}

function isDataIntent(q) {
  return /\b(how's|how is|show|current|latest|week|ytd|trend|wow|change|delta|top|mix|percent|%|auth rate|ic rate|aov|decline|visa|mastercard|contactless|swipe|chip|sales volume|transaction volume|returns)\b/.test(
    q
  );
}

function isGreeting(q) {
  return /^(hi|hello|hey|yo|sup|good morning|good afternoon)\b/.test(q) || q === "help";
}

function answerGreeting() {
  const period = currentPeriod();
  const label = period?.label || "the selected period";
  return `Hey! I’m the In Shop data desk for **${label}**. ${HELP_TEXT}`;
}

function answerDefinition(def) {
  return `**${def.title}** — ${def.body}`;
}

function answerKpi(key) {
  const period = currentPeriod();
  if (!period) return "I don’t have dashboard data loaded yet. Refresh the page and try again.";
  const kpi = period.kpis[key];
  const label = (window.KPI_ORDER || []).find((k) => k.key === key)?.label || key;
  const value = formatKpiValue(key, kpi.value);
  const delta = formatDelta(key, kpi.delta);
  const history = (kpi.history || []).slice(-4);
  const trend =
    history.length > 1
      ? ` Recent weeks: ${history.map((h) => `${h.week_start}: ${formatKpiValue(key, h.value)}`).join("; ")}.`
      : "";
  return `For **${period.label}**, **${label}** is **${value}** (${delta}).${trend}`;
}

function answerMix(kind) {
  const period = currentPeriod();
  if (!period) return "No data loaded yet.";
  const map = {
    entry: ["entry_method_mix", "Entry method mix"],
    payment: ["payment_type_mix", "Payment type mix"],
    wallet: ["wallet_mix", "Wallet mix"],
  };
  const [field, title] = map[kind] || map.entry;
  const items = period[field];
  const lines = (items || [])
    .slice(0, 6)
    .map((i) => `• ${i.label}: ${(i.pct * 100).toFixed(1)}%`)
    .join("\n");
  return `**${title}** for **${period.label}**:\n${lines}`;
}

function answerDeclines() {
  const period = currentPeriod();
  if (!period) return "No data loaded yet.";
  const top = (period.decline_reasons || []).slice(0, 5);
  if (!top.length) return "I don’t see decline reasons for this period.";
  const lines = top.map((d, idx) => `${idx + 1}. ${d.label}: ${Number(d.count).toLocaleString()} auth requests`).join("\n");
  return `Top decline reasons for **${period.label}**:\n${lines}`;
}

function answerScope() {
  const state = getState();
  const scope = state?.data?.meta?.scope || "Company owned shops only";
  const channel = state?.data?.meta?.channel || "In Shop · Worldpay";
  const weeks = state?.data?.periods?.weeks?.length || 0;
  return `You’re looking at **${channel}** (${scope}). I have **${weeks}** week(s) loaded, plus YTD. Other channels are Coming soon.`;
}

function answerOffTopic() {
  return OFF_TOPIC_REPLIES[Math.floor(Math.random() * OFF_TOPIC_REPLIES.length)];
}

function answerQuestion(raw) {
  const q = normalize(raw);
  if (!q) return "Ask me a payments/data question — I’m all ears (and interchange fees).";

  if (isGreeting(q) || q.includes("what can you") || q.includes("help")) {
    return answerGreeting();
  }

  const def = findDefinition(q);
  const kpiKey = detectKpiKey(q);

  if (isDefinitionIntent(q) && def) {
    return answerDefinition(def);
  }

  if (/\b(scope|company owned|in shop|worldpay|what am i looking)\b/.test(q)) {
    return answerScope();
  }

  if (/\b(decline|declines|do not honor|why.*(fail|decline))\b/.test(q)) {
    return answerDeclines();
  }

  if (/\b(entry method mix|entry method)\b/.test(q) && !/\bauth rate by entry\b/.test(q)) {
    return answerMix("entry");
  }

  if (/\b(payment type mix|payment type|card brand)\b/.test(q)) {
    return answerMix("payment");
  }

  if (/\b(wallet mix|apple pay|google pay|wallet)\b/.test(q)) {
    return answerMix("wallet");
  }

  if (/\bauth rate by entry\b/.test(q)) {
    const period = currentPeriod();
    if (!period) return "No data loaded yet.";
    const lines = (period.auth_rate_by_entry || [])
      .slice(0, 6)
      .map((i) => `• ${i.label}: ${(i.auth_rate * 100).toFixed(2)}%`)
      .join("\n");
    return `**Auth rate by entry method** for **${period.label}**:\n${lines}`;
  }

  if (kpiKey) {
    return answerKpi(kpiKey);
  }

  if (def) {
    return answerDefinition(def);
  }

  if (isDataIntent(q)) {
    return `I can pull numbers for auth rate, AOV, returns %, sales volume, transaction volume, IC rate, mixes, and declines — for the period selected above. ${HELP_TEXT}`;
  }

  return answerOffTopic();
}

function appendMessage(role, text) {
  const log = document.getElementById("chat-log");
  if (!log) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/_(.+?)_/g, "<em>$1</em>")
    .replace(/\n/g, "<br>");
  log.appendChild(bubble);
  log.scrollTop = log.scrollHeight;
}

function initChatbot() {
  const form = document.getElementById("chat-form");
  const input = document.getElementById("chat-input");
  if (!form || !input) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    appendMessage("user", text);
    input.value = "";
    const reply = answerQuestion(text);
    setTimeout(() => appendMessage("bot", reply), 120);
  });

  appendMessage(
    "bot",
    "Ask about the numbers on this page or payment terms (auth rate, IC rate, AOV, declines, and more). Off-topic questions get a polite pass."
  );
}

function startChatbotWhenUnlocked() {
  if (document.body.classList.contains("auth-unlocked")) {
    initChatbot();
    return;
  }
  window.addEventListener("dashboard:unlocked", () => initChatbot(), { once: true });
}

document.addEventListener("DOMContentLoaded", startChatbotWhenUnlocked);
