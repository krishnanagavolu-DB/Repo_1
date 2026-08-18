/* Ask Data is one assistant across every tab. The tab you happen to be on must
   never change the answer, and a genuinely ambiguous metric must ask which
   dataset rather than silently picking one. */

const fs = require("fs");
const vm = require("vm");

const dashboard = JSON.parse(fs.readFileSync("site/preview/data/dashboard.json", "utf8"));
const benchmarks = JSON.parse(fs.readFileSync("site/preview/data/benchmarks.json", "utf8"));
const posRaw = JSON.parse(fs.readFileSync("site/preview/data/in_shop_sales_data.json", "utf8"));

function buildBot(activeTab) {
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
    window: { __benchmarkData: benchmarks, addEventListener() {}, dispatchEvent() {} },
    document: {
      addEventListener() {},
      querySelectorAll: () => [],
      // The chatbot used to read the active tab; this stub proves it no longer matters.
      querySelector: (selector) =>
        selector.includes(".tab") ? { dataset: { tab: activeTab } } : null,
      getElementById: () => null,
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
  const chat = sandbox.window.__paymentsChat;
  chat.chatContext.activeTab = activeTab;
  return chat;
}

const onPos = buildBot("pos");
const onWorldpay = buildBot("worldpay");
const failures = [];

function reset(chat) {
  chat.chatContext.topic = null;
  chat.chatContext.mixKind = null;
  chat.chatContext.pendingChoice = null;
  chat.chatContext.activeTab = chat === onPos ? "pos" : "worldpay";
}

/** The same question on either tab must produce the same answer. */
function sameOnBothTabs(question) {
  reset(onPos);
  reset(onWorldpay);
  const fromPos = onPos.answerQuestion(question);
  const fromWorldpay = onWorldpay.answerQuestion(question);
  if (fromPos !== fromWorldpay) {
    failures.push({ question, problem: "answer depends on the active tab", fromPos, fromWorldpay });
  }
  return fromPos;
}

function expect(name, answer, pattern) {
  if (!pattern.test(answer)) {
    failures.push({ name, expected: String(pattern), answer });
  }
}

// The reported question: asked from the All payments tab, it was refused.
const androidTrend = sameOnBothTabs("what is the trend of Android pay payments over the last 4 weeks?");
expect("android pay trend has weekly shares", androidTrend, /Android Pay[\s\S]*%[\s\S]*%/);
expect("android pay trend is not a refusal", androidTrend, /^(?![\s\S]*do \*\*not\*\* appear)/);

// A spread of questions must be tab-independent.
for (const question of [
  "Show wallet mix",
  "What is the auth rate?",
  "Show the tender mix",
  "Explain the exclusions in the data",
  "What are the assumptions?",
  "How many Apple Pay transactions?",
  "Is Apple Pay in the All payments tender mix?",
  "What is AVG_TICKET?",
  "What was AOV last week?",
  "Which metrics need attention?",
]) {
  sameOnBothTabs(question);
}

// A metric that exists on both feeds, with no channel named, asks which one.
const ambiguous = sameOnBothTabs("What is the average ticket?");
expect("clarifier names All payments", ambiguous, /All payments/i);
expect("clarifier names Card present", ambiguous, /Card present/i);
expect("clarifier actually asks", ambiguous, /\?/);
expect("clarifier does not state a figure", ambiguous, /^(?![\s\S]*\$\d)/);

// Answering the clarifier with just the channel name resolves it.
reset(onPos);
onPos.answerQuestion("What is the average ticket?");
const pickedPos = onPos.answerQuestion("All payments");
expect("choosing All payments gives the Xenial ticket", pickedPos, /\$9\.97|AVG_TICKET/);

reset(onWorldpay);
onWorldpay.answerQuestion("What is the average ticket?");
const pickedWp = onWorldpay.answerQuestion("Card present");
expect("choosing Card present gives Worldpay AOV", pickedWp, /AOV|\$12/);

// Naming the channel up front must never trigger the clarifier.
const explicitPos = sameOnBothTabs("What is the average ticket on All payments?");
expect("explicit All payments answers directly", explicitPos, /\$9\.97|payment lines/);
const explicitWp = sameOnBothTabs("What was AOV last week?");
expect("explicit AOV answers directly", explicitWp, /AOV/);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Channel-agnostic chatbot smoke checks passed");
