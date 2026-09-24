/* The dashboard is only trustworthy if the bot can state what was left out.
   These questions must never fall through to the off-topic reply. */

const fs = require("fs");
const vm = require("vm");

const dashboard = JSON.parse(fs.readFileSync("site/preview/data/dashboard.json", "utf8"));
const benchmarks = JSON.parse(fs.readFileSync("site/preview/data/benchmarks.json", "utf8"));
const posRaw = JSON.parse(fs.readFileSync("site/preview/data/in_shop_sales_data.json", "utf8"));

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
const weeks = sandbox.window.__posSales.normalizePosData(posRaw);
sandbox.window.__posSalesState = { weeks, latest: weeks.at(-1) };
vm.runInContext(fs.readFileSync("site/preview/js/chatbot.js", "utf8"), sandbox);

const ask = sandbox.window.__paymentsChat.answerQuestion;
const chatContext = sandbox.window.__paymentsChat.chatContext;
const failures = [];

const OFF_TOPIC = /outside my Worldpay lane|payments data desk, not the whole internet|only have the data on this dashboard/i;

function check(question, expected) {
  chatContext.topic = null;
  const answer = ask(question);
  if (OFF_TOPIC.test(answer)) {
    failures.push({ question, problem: "fell through to off-topic reply", answer });
    return;
  }
  if (!expected.test(answer)) {
    failures.push({ question, expected: String(expected), answer });
  }
}

// Exclusions — the filters applied before a number reaches the page.
check("Explain the exclusions in the data", /tips|change|UNKNOWN|quarantine/i);
check("What is excluded?", /tips|change/i);
check("What is filtered out?", /UNKNOWN|quarantine|tips|change/i);
check("What is left out of the numbers?", /tips|change/i);
check("What does this data not include?", /tips|change|discount|item/i);

// Assumptions — judgement calls a reader should be able to challenge.
check("What are the assumptions?", /Gold|CREDIT|CUSTOM|0OS957/i);
check("What assumptions were made in this data?", /Gold|CREDIT|CUSTOM|0OS957/i);
check("What caveats should I know?", /assumption|exclu|tips|Gold/i);
check("What are the data limitations?", /assumption|exclu|tips|Gold/i);
check("What should I know before sharing this with leadership?", /assumption|exclu|tips|Gold/i);

// The specific judgement calls from the source spec.
const assumptions = ask("What are the assumptions?");
for (const [label, pattern] of [
  ["Gold store list", /Gold|OWNERSHIP|Company Owned/i],
  ["$10k line filter not applied", /\$10k/i],
  ["card is all CREDIT", /CREDIT/i],
  ["Dutch Pass is CUSTOM", /CUSTOM/i],
  ["Worldpay chain not confirmed equal", /0OS957|not confirmed/i],
]) {
  if (!pattern.test(assumptions)) {
    failures.push({ question: "assumptions content", problem: `missing ${label}`, answer: assumptions });
  }
}

const exclusions = ask("Explain the exclusions in the data");
for (const [label, pattern] of [
  ["tips", /tips/i],
  ["change", /change/i],
  ["UNKNOWN tenders", /UNKNOWN/i],
  ["quarantine", /quarantine/i],
]) {
  if (!pattern.test(exclusions)) {
    failures.push({ question: "exclusions content", problem: `missing ${label}`, answer: exclusions });
  }
}

// Naming one item gets that item's answer, not the whole list.
check("Why are tips excluded from All payments?", /not drink sales/i);
check("Why is change excluded?", /cash handed back/i);
check("Is Apple Pay excluded?", /Card present|Worldpay/i);
check("Are discounts excluded?", /not.*in this All payments KPI|Xenial table/i);
check("Are taxes included?", /not.*in this All payments KPI|Xenial table/i);
check("Are refunds excluded?", /not excluded|negative/i);

// Refunds stay in as negatives — that is not an exclusion, and the bot should say so.
if (!/refund/i.test(exclusions)) {
  failures.push({ question: "exclusions content", problem: "does not mention refunds", answer: exclusions });
}

// An unrecognized question should still point at what the bot does know.
const fallback = ask("Tell me a joke about badgers");
if (!/exclusion|assumption/i.test(fallback)) {
  failures.push({ question: "fallback", problem: "does not offer exclusions/assumptions", answer: fallback });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Exclusions/assumptions chatbot smoke checks passed");
