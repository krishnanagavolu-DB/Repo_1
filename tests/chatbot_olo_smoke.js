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
sandbox.window.__oloPayState = { weeks: oloWeeks, latest: oloWeeks.at(-1), methodology: oloRaw.methodology || null };
if (sandbox.window.__oloPay) sandbox.window.__oloPay.methodology = oloRaw.methodology || null;
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

// After an Olo answer, explicitly named other-channel metrics must not leak Olo.
ask("What is Olo Pay sales volume?");
const stickyWpAuth = ask("What is the Card present auth rate?");
if (!/\b98\.\d+%/.test(stickyWpAuth)) {
  failures.push({
    name: "after Olo, Card present auth returns Worldpay KPI",
    answer: stickyWpAuth,
  });
}
if (/Olo Pay|Approved ÷ \(Approved|96\.78%|billing total Olo/i.test(stickyWpAuth)) {
  failures.push({
    name: "after Olo, Card present auth does not leak Olo",
    answer: stickyWpAuth,
  });
}

ask("What is Olo Pay sales volume?");
const stickyPosTicket = ask("What is the average ticket on All payments?");
if (!/\$10\.\d+/.test(stickyPosTicket)) {
  failures.push({
    name: "after Olo, All payments ticket returns POS ticket",
    answer: stickyPosTicket,
  });
}
if (/Olo Pay|\$11\.30|ORDER_COUNT|tips are not subtracted|Approved ÷/i.test(stickyPosTicket)) {
  failures.push({
    name: "after Olo, All payments ticket does not leak Olo",
    answer: stickyPosTicket,
  });
}

// Unnamed Olo follow-ups such as brand mix still stay on Olo.
ask("What is Olo Pay sales volume?");
const stickyBrand = ask("Show brand mix");
if (!/Visa|ACCOUNT_ISSUER|card brand/i.test(stickyBrand)) {
  failures.push({
    name: "after Olo, unnamed brand mix still answers Olo",
    answer: stickyBrand,
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

// Required: sticky Olo must yield generic wallet/decline asks to Worldpay.
reset();
ask("What is Olo Pay sales volume?");
const stickyWallet = ask("Show wallet mix");
if (!/\*\*Wallet mix/i.test(stickyWallet)) {
  failures.push({
    name: "after Olo, Show wallet mix returns Worldpay wallet mix",
    answer: stickyWallet,
  });
}
if (/Olo Pay · Phase 1|Phase 1:.*wallet/i.test(stickyWallet)) {
  failures.push({
    name: "after Olo, Show wallet mix is not Olo Phase 1 unavailable",
    answer: stickyWallet,
  });
}

reset();
ask("What is Olo Pay sales volume?");
const stickyDeclines = ask("What are the decline reasons?");
if (!/\*\*Decline reasons/i.test(stickyDeclines)) {
  failures.push({
    name: "after Olo, decline reasons returns Worldpay declines",
    answer: stickyDeclines,
  });
}
if (/Olo Pay · Phase 1|Phase 1:.*decline/i.test(stickyDeclines)) {
  failures.push({
    name: "after Olo, decline reasons is not Olo Phase 1 unavailable",
    answer: stickyDeclines,
  });
}

// Explicit Olo-named wallet/decline asks keep Phase 1 unavailable.
check("Olo Pay wallet mix", /unavailable|not (available|in)|Phase 1|phase 1/i);
check("Olo Pay decline reasons", /unavailable|not (available|in)|Phase 1|phase 1/i);

// Clarifier chips include Olo; auth offers Card present + Olo only.
reset();
ask("What is the auth rate?");
if (typeof chat.suggestedFollowUps !== "function") {
  failures.push({ name: "suggestedFollowUps is exported for chip checks" });
} else {
  const authChips = chat.suggestedFollowUps();
  const authLabels = authChips.map((c) => c.label).join(" | ");
  if (!/Card present/i.test(authLabels) || !/Olo/i.test(authLabels)) {
    failures.push({ name: "auth clarifier chips include Card present and Olo", chips: authChips });
  }
  if (/All payments/i.test(authLabels)) {
    failures.push({ name: "auth clarifier chips do not offer All payments", chips: authChips });
  }
}

reset();
ask("What were sales this week?");
if (typeof chat.suggestedFollowUps === "function") {
  const salesChips = chat.suggestedFollowUps();
  const salesLabels = salesChips.map((c) => c.label).join(" | ");
  if (!/Olo/i.test(salesLabels)) {
    failures.push({ name: "sales clarifier chips include Olo", chips: salesChips });
  }
  if (!/All payments/i.test(salesLabels) || !/Card present/i.test(salesLabels)) {
    failures.push({
      name: "sales clarifier chips reflect All payments and Card present lanes",
      chips: salesChips,
    });
  }
}

// Auth ordinal "third" must not silently clear the pending choice.
reset();
ask("What is the auth rate?");
const beforeThird = chat.chatContext.pendingChoice;
ask("third");
if (chat.chatContext.pendingChoice !== beforeThird || beforeThird !== "auth") {
  failures.push({
    name: "auth ordinal third keeps pendingChoice=auth",
    before: beforeThird,
    after: chat.chatContext.pendingChoice,
  });
}
const afterThirdFirst = ask("first");
if (!/\b98\.\d+%/.test(afterThirdFirst) || /does not publish|Olo Pay \*\*/i.test(afterThirdFirst)) {
  failures.push({
    name: "after invalid third, first still selects Worldpay auth",
    answer: afterThirdFirst,
  });
}

// Olo refund and void values from selected-period state.
const refundFmt = olo.usd(latest.refunds);
const voidFmt = olo.usd(latest.voids);
check("What is Olo Pay refund volume?", new RegExp(escapeRegExp(refundFmt)));
check("What is Olo Pay void volume?", new RegExp(escapeRegExp(voidFmt)));

// Olo exclusions are methodology limitations, not All payments exclusions.
reset();
const oloExclude = ask("What does Olo Pay exclude?");
if (/What is excluded from All payments|Tips — not drink sales|UNKNOWN payment types/i.test(oloExclude)) {
  failures.push({
    name: "Olo Pay exclude is not All payments exclusions list",
    answer: oloExclude,
  });
}
if (!/Phase 1|wallet|decline|franchise|Apple Pay|Google Pay|not in this extract|methodology/i.test(oloExclude)) {
  failures.push({
    name: "Olo Pay exclude returns Olo methodology limitations",
    answer: oloExclude,
  });
}


// Sticky Olo must yield generic refund rate to Worldpay; explicit Olo refunds stay Olo.
reset();
ask("What is Olo Pay sales volume?");
const stickyRefundRate = ask("refund rate");
if (!/Returns as % of sales|Return\/refund dollars|0\.\d+%/i.test(stickyRefundRate)) {
  failures.push({
    name: "after Olo, refund rate returns Worldpay returns KPI",
    answer: stickyRefundRate,
  });
}
if (/Olo Pay \*\*REFUND_VOLUME\*\*|REFUND_VOLUME is/i.test(stickyRefundRate)) {
  failures.push({
    name: "after Olo, refund rate is not Olo refund volume",
    answer: stickyRefundRate,
  });
}
check("What is Olo Pay refund volume?", new RegExp(escapeRegExp(olo.usd(latest.refunds))));

// Olo-named limitations/caveats/methodology must not fall through to POS assumptions.
for (const q of ["Olo Pay limitations", "Olo Pay caveats", "Olo Pay methodology"]) {
  reset();
  const answer = ask(q);
  if (/Assumptions behind All payments|judgement call/i.test(answer)) {
    failures.push({ name: `${q} is not POS assumptions`, answer });
  }
  if (!/Phase 1|methodology|not in this extract|franchise|wallet|decline|Apple Pay|Google Pay/i.test(answer)) {
    failures.push({ name: `${q} returns Olo methodology limitations`, answer });
  }
}

// Limitation bullets prefer published methodology.not_in_this_extract; HTML is escaped.
const publishedLimits = (oloRaw.methodology && oloRaw.methodology.not_in_this_extract) || [];
if (publishedLimits.length) {
  reset();
  const lim = ask("Olo Pay limitations");
  const sample = String(publishedLimits[0]).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(sample).test(lim)) {
    failures.push({
      name: "Olo limitations use published not_in_this_extract text",
      answer: lim,
      expectedSample: publishedLimits[0],
    });
  }
}
{
  const prev = sandbox.window.__oloPayState.methodology;
  sandbox.window.__oloPayState.methodology = {
    not_in_this_extract: ['<script>alert("x")</script>', "Safe franchise note"],
  };
  reset();
  const injected = ask("Olo Pay limitations");
  if (/<script>/i.test(injected) || !/&lt;script&gt;/.test(injected)) {
    failures.push({
      name: "Olo limitation bullets HTML-escape published extract items",
      answer: injected,
    });
  }
  if (!/Safe franchise note/.test(injected)) {
    failures.push({
      name: "Olo limitation bullets include safe published extract items",
      answer: injected,
    });
  }
  sandbox.window.__oloPayState.methodology = prev;
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Olo chatbot smoke checks passed");

