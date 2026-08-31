/* Ask Data must answer Olo Pay from window.__oloPayState only — selected-period
   published figures, Stripe/Olo billing source, CO-only scope, and Phase 1
   wallet/decline unavailability without inventing values. */

const fs = require("fs");
const vm = require("vm");

const dashboard = JSON.parse(fs.readFileSync("site/preview/data/dashboard.json", "utf8"));
const benchmarks = JSON.parse(fs.readFileSync("site/preview/data/benchmarks.json", "utf8"));
const posRaw = JSON.parse(fs.readFileSync("site/preview/data/in_shop_sales_data.json", "utf8"));
const oloRaw = JSON.parse(fs.readFileSync("site/preview/data/olo_pay_data.json", "utf8"));

const sandbox = {
  console,
  Intl,
  Math,
  Number,
  String,
  Object,
  Array,
  RegExp,
  Date,
  setTimeout: (callback) => callback(),
  window: {
    __benchmarkData: benchmarks,
    addEventListener() {},
    dispatchEvent() {},
  },
  document: {
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    getElementById() {
      return null;
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/dashboard.js", "utf8"), sandbox);
sandbox.window.__dashboardState = {
  data: dashboard,
  periodId: dashboard.periods.weeks.at(-1).id,
};
vm.runInContext(fs.readFileSync("site/preview/js/pos-sales.js", "utf8"), sandbox);
const posWeeks = sandbox.window.__posSales.normalizePosData(posRaw);
sandbox.window.__posSalesState = { weeks: posWeeks, latest: posWeeks.at(-1) };
vm.runInContext(fs.readFileSync("site/preview/js/olo-pay.js", "utf8"), sandbox);
const oloWeeks = sandbox.window.__oloPay.normalizeOloData(oloRaw);
sandbox.window.__oloPayState = { weeks: oloWeeks, latest: oloWeeks.at(-1) };
vm.runInContext(fs.readFileSync("site/preview/js/chatbot.js", "utf8"), sandbox);

const chat = sandbox.window.__paymentsChat;
const ask = chat.answerQuestion;
const olo = sandbox.window.__oloPay;
const failures = [];

function reset() {
  chat.chatContext.topic = null;
  chat.chatContext.mixKind = null;
  chat.chatContext.pendingChoice = null;
  chat.chatContext.kpiKey = null;
}

function check(question, expected) {
  reset();
  const answer = ask(question);
  if (!expected.test(answer)) {
    failures.push({ question, expected: String(expected), answer });
  }
  return answer;
}

const latest = oloWeeks.at(-1);
const earlier = oloWeeks.at(-2);
const salesFmt = olo.usd(latest.sales);
const authFmt = olo.authPct(latest.authRatePct);
const ordersFmt = olo.count(latest.orders);
const ticketFmt = olo.ticket(latest.avgTicket);
const brand0Amt = olo.usd(latest.brands[0].amount);
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Olo-named metrics must use the selected week's published figures.
check("What is Olo Pay sales volume?", new RegExp(escapeRegExp(salesFmt)));
check("What is SALES_VOLUME on Olo?", new RegExp(escapeRegExp(salesFmt)));
check("What is the Olo authorization rate?", new RegExp(escapeRegExp(authFmt)));
check("What is the Olo auth rate?", new RegExp(escapeRegExp(authFmt)));
check("How many Olo orders were there?", new RegExp(escapeRegExp(ordersFmt)));
check("What is ORDER_COUNT on Olo Pay?", new RegExp(escapeRegExp(ordersFmt)));
check("What is the average ticket on Olo?", new RegExp(escapeRegExp(ticketFmt)));
check("What is AVG_TICKET on Olo Pay?", new RegExp(escapeRegExp(ticketFmt)));
check("Show Olo card brand mix", /Visa/i);
check("Show Olo card brand mix", new RegExp(escapeRegExp(brand0Amt)));
check("Show Olo Pay brand mix", /Mastercard|Amex|Discover/i);

// Selected period must drive answers — not always the latest loaded week.
olo.selectPeriod(earlier.sortKey);
const earlierSales = olo.usd(earlier.sales);
const earlierAuth = olo.authPct(earlier.authRatePct);
check(
  "What is Olo Pay sales volume for the selected week?",
  new RegExp(escapeRegExp(earlierSales))
);
check("What is the Olo auth rate?", new RegExp(escapeRegExp(earlierAuth)));
olo.selectPeriod(latest.sortKey);

// Source + scope.
check("Where does Olo Pay data come from?", /Stripe/i);
check("Where does Olo Pay data come from?", /billing|Olo/i);
check("What is the source for Olo sales?", /Stripe/i);
check("Is Olo Pay company owned only?", /company[- ]owned/i);
check("What is the scope of Olo Pay?", /company[- ]owned/i);

// Phase 1 limitations — unavailable, never invent numbers.
const wallet = check("Show Olo wallet mix", /unavailable|not (available|in)|Phase 1|phase 1/i);
if (/\$\d/.test(wallet) && !/unavailable|not (available|in)|Phase 1/i.test(wallet)) {
  failures.push({ question: "Show Olo wallet mix", problem: "invented wallet figures", answer: wallet });
}
const declines = check(
  "What are the Olo decline reasons?",
  /unavailable|not (available|in)|Phase 1|phase 1/i
);
if (/\d{2,}/.test(declines) && !/unavailable|not (available|in)|Phase 1/i.test(declines)) {
  failures.push({
    question: "What are the Olo decline reasons?",
    problem: "invented decline counts",
    answer: declines,
  });
}
check(
  "Is Apple Pay in the Olo brand mix?",
  /ACCOUNT_ISSUER|card brand|wallet|Phase 1|unavailable|not/i
);

// Ambiguous sales/ticket must stay channel-aware and name Olo as an option.
reset();
const ambiguousTicket = ask("What is the average ticket?");
if (!/All payments/i.test(ambiguousTicket) || !/Card present/i.test(ambiguousTicket)) {
  failures.push({
    name: "ambiguous ticket still names Worldpay/POS",
    answer: ambiguousTicket,
  });
}
if (!/Olo/i.test(ambiguousTicket)) {
  failures.push({ name: "ambiguous ticket names Olo", answer: ambiguousTicket });
}
if (/\$\d/.test(ambiguousTicket)) {
  failures.push({ name: "ambiguous ticket states no figure", answer: ambiguousTicket });
}

reset();
const ambiguousSales = ask("What were sales this week?");
if (!/Olo/i.test(ambiguousSales) || !/All payments/i.test(ambiguousSales)) {
  failures.push({ name: "ambiguous sales names Olo and All payments", answer: ambiguousSales });
}

// Choosing Olo after the clarifier resolves to Olo figures.
reset();
ask("What is the average ticket?");
const pickedOlo = ask("Olo Pay");
if (!new RegExp(escapeRegExp(ticketFmt)).test(pickedOlo)) {
  failures.push({
    name: "choosing Olo Pay gives Olo ticket",
    expected: ticketFmt,
    answer: pickedOlo,
  });
}

// Explicit Worldpay / All payments must not be stolen by Olo routing.
check("What was AOV last week?", /AOV|\$12/i);
check("What is the average ticket on All payments?", /\$10\.\d+|guest checks|payment lines/i);

// Auth clarifier: Card present first, then Olo. Ordinals are kind-aware.
reset();
const authAsk = ask("What is the auth rate?");
if (!/Card present/i.test(authAsk) || !/Olo/i.test(authAsk)) {
  failures.push({ name: "bare auth clarifier names Card present and Olo", answer: authAsk });
}
if (/\$\d|\d+\.\d+%/.test(authAsk) && !/\?/.test(authAsk)) {
  failures.push({ name: "bare auth clarifier states no figure", answer: authAsk });
}
const cardIdx = authAsk.search(/Card present/i);
const oloIdx = authAsk.search(/Olo/i);
if (!(cardIdx >= 0 && oloIdx > cardIdx)) {
  failures.push({ name: "auth clarifier lists Card present before Olo", answer: authAsk });
}

reset();
ask("What is the auth rate?");
const authFirst = ask("first");
if (!/\b98\.\d+%/.test(authFirst) || /does not publish|Olo Pay \*\*/i.test(authFirst)) {
  failures.push({
    name: "auth ordinal first selects Worldpay",
    answer: authFirst,
  });
}

reset();
ask("What is the auth rate?");
const authSecond = ask("second");
if (!new RegExp(escapeRegExp(authFmt)).test(authSecond)) {
  failures.push({
    name: "auth ordinal second selects Olo",
    expected: authFmt,
    answer: authSecond,
  });
}

// Invalid All payments on auth re-arms pending; next Olo/Card reply resolves.
reset();
ask("What is the auth rate?");
const invalidLane = ask("All payments");
if (!/Card present|Olo/i.test(invalidLane)) {
  failures.push({ name: "invalid All payments on auth reminds of valid lanes", answer: invalidLane });
}
const afterInvalidOlo = ask("Olo Pay");
if (!new RegExp(escapeRegExp(authFmt)).test(afterInvalidOlo)) {
  failures.push({
    name: "Olo after invalid All payments still resolves auth",
    expected: authFmt,
    answer: afterInvalidOlo,
  });
}

reset();
ask("What is the auth rate?");
ask("All payments");
const afterInvalidCard = ask("Card present");
if (!/\b98\.\d+%/.test(afterInvalidCard) || /does not publish/i.test(afterInvalidCard)) {
  failures.push({
    name: "Card present after invalid All payments resolves Worldpay auth",
    answer: afterInvalidCard,
  });
}

// Sticky Olo topic must not swallow bare sales — still clarify three lanes.
reset();
ask("What is Olo Pay sales volume?");
const bareAboutSales = ask("What about sales?");
if (!/All payments/i.test(bareAboutSales) || !/Card present/i.test(bareAboutSales) || !/Olo/i.test(bareAboutSales)) {
  failures.push({
    name: "after Olo, What about sales? asks three-lane clarifier",
    answer: bareAboutSales,
  });
}
if (new RegExp(escapeRegExp(salesFmt)).test(bareAboutSales) && !/\?/.test(bareAboutSales)) {
  failures.push({
    name: "after Olo, What about sales? does not assume Olo figure",
    answer: bareAboutSales,
  });
}

reset();
ask("What is Olo Pay sales volume?");
const bareSales = ask("sales?");
if (!/All payments/i.test(bareSales) || !/Card present/i.test(bareSales) || !/Olo/i.test(bareSales)) {
  failures.push({
    name: "after Olo, sales? asks three-lane clarifier",
    answer: bareSales,
  });
}

// Explicit Card present auth still returns Worldpay KPI, not a definition-only gloss.
reset();
const explicitWpAuth = ask("What is the Card present auth rate?");
if (!/\b98\.\d+%/.test(explicitWpAuth)) {
  failures.push({
    name: "explicit Card present auth returns Worldpay auth rate",
    answer: explicitWpAuth,
  });
}
if (/Olo Pay \*\*|Approved ÷ \(Approved/i.test(explicitWpAuth)) {
  failures.push({
    name: "explicit Card present auth is not Olo",
    answer: explicitWpAuth,
  });
}

// Help copy mentions Olo Pay and Phase 1 limits.
reset();
const help = ask("help");
if (!/Olo Pay/i.test(help)) {
  failures.push({ name: "help mentions Olo Pay", answer: help });
}
if (!/Phase 1|wallet|decline/i.test(help)) {
  failures.push({ name: "help mentions Phase 1 limitations", answer: help });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Olo chatbot smoke checks passed");
