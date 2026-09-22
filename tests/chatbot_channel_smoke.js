/* Ask Data is one assistant across every tab. The tab you happen to be on must
   never change the answer, and a genuinely ambiguous metric must ask which
   dataset rather than silently picking one. */

const fs = require("fs");
const vm = require("vm");

const dashboard = JSON.parse(fs.readFileSync("data/processed/dashboard.json", "utf8"));
const benchmarks = JSON.parse(fs.readFileSync("data/processed/benchmarks.json", "utf8"));
const posRaw = JSON.parse(fs.readFileSync("data/processed/in_shop_sales_data.json", "utf8"));

function buildBot(activeTab) {
  const eventListeners = {};
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
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    },
    window: {
      __benchmarkData: benchmarks,
      addEventListener(type, handler) {
        (eventListeners[type] = eventListeners[type] || []).push(handler);
      },
      dispatchEvent(event) {
        for (const handler of eventListeners[event.type] || []) handler(event);
      },
    },
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
  chat.emitPeriod = (detail) => {
    sandbox.window.dispatchEvent(new sandbox.CustomEvent("dashboard:period", { detail }));
  };
  chat.selectedPeriodId = () => sandbox.window.__dashboardState?.periodId;
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

function checkAnswer(question, pattern) {
  expect(question, sameOnBothTabs(question), pattern);
}

const inShopDefinition = sameOnBothTabs("What is In-Shop Sales?");
expect("In-Shop Sales definition names source", inShopDefinition, /POS.*Gold Semantic Sales/i);
expect("In-Shop Sales definition names scope", inShopDefinition, /company-owned/i);
expect("In-Shop Sales definition names weekly grain", inShopDefinition, /completed Monday.?Sunday/i);
expect("In-Shop Sales definition names all tenders", inShopDefinition, /Card.*Cash.*Gift Card.*Dutch Pass/i);
expect("In-Shop Sales definition names exclusions", inShopDefinition, /exclude.*tips.*change/i);
expect(
  "In-Shop Sales definition preserves curated company-owned ownership",
  inShopDefinition,
  /VW_DIM_STORE_CURATED\.OWNERSHIP\s*=\s*Company Owned/i
);
expect("In-Shop Sales definition states published tender mix is 100%", inShopDefinition, /mix.*100%/i);
expect(
  "In-Shop Sales definition cross-references separate Worldpay card authorizations",
  inShopDefinition,
  /Worldpay.*card authorizations/i
);

const legacyPosDefinition = sameOnBothTabs("What is All payments?");
if (legacyPosDefinition !== inShopDefinition) {
  failures.push({
    name: "legacy All payments query uses canonical In-Shop Sales definition",
    expected: inShopDefinition,
    answer: legacyPosDefinition,
  });
}
checkAnswer("What is Card Health?", /Worldpay.*authoriz.*decline.*interchange/i);
const nonAdditivity = sameOnBothTabs("Can I add POS and Worldpay sales?");
expect("POS and Worldpay non-additivity names overlap", nonAdditivity, /overlap/i);
const doNotAddCount = (nonAdditivity.match(/do not add/gi) || []).length;
if (doNotAddCount !== 1) {
  failures.push({
    name: "POS and Worldpay non-additivity says do not add exactly once",
    expected: 1,
    actual: doNotAddCount,
    answer: nonAdditivity,
  });
}
checkAnswer("What does YTD mean?", /Available history.*loaded weeks/i);

const overviewPrompts = onPos.tabPrompts?.overview || [];
if (overviewPrompts.length === 0) {
  failures.push({ name: "Executive Overview has its own Ask Data prompts" });
}
expect(
  "Executive Overview Ask Data prompts are executive-specific",
  overviewPrompts.map((prompt) => `${prompt.label} ${prompt.question}`).join(" "),
  /channel|overlap|executive|attention/i
);
expect(
  "Executive Overview has its own Ask Data blurb",
  onPos.tabBlurb?.("overview") || "",
  /Executive Overview.*In-Shop Sales.*Card Health.*Order Ahead/i
);

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
expect("choosing All payments gives the Xenial ticket", pickedPos, /\$10\.03|AVG_TICKET/);

reset(onWorldpay);
onWorldpay.answerQuestion("What is the average ticket?");
const pickedWp = onWorldpay.answerQuestion("Card present");
expect("choosing Card present gives Worldpay AOV", pickedWp, /AOV|\$12/);

// Naming the channel up front must never trigger the clarifier.
const explicitPos = sameOnBothTabs("What is the average ticket on All payments?");
expect("explicit All payments answers directly", explicitPos, /\$10\.03|payment lines|guest checks/);
const explicitWp = sameOnBothTabs("What was AOV last week?");
expect("explicit AOV answers directly", explicitWp, /AOV/);

const overviewWeek = dashboard.periods.weeks.at(-2);
onPos.emitPeriod({ tabId: "overview", periodId: overviewWeek.id, reason: "selection" });
if (onPos.selectedPeriodId() !== overviewWeek.id) {
  failures.push({
    name: "Overview period events update shared dashboard state",
    expected: overviewWeek.id,
    actual: onPos.selectedPeriodId(),
  });
}
reset(onPos);
const overviewWeekAuth = onPos.answerQuestion("What was the Card present auth rate?");
expect("Overview Ask Data auth answer uses the selected week label", overviewWeekAuth, new RegExp(overviewWeek.label));
expect(
  "Overview Ask Data auth answer uses the selected week's value",
  overviewWeekAuth,
  new RegExp(`${(overviewWeek.kpis.auth_rate.value * 100).toFixed(2)}%`)
);

onPos.emitPeriod({ tabId: "overview", periodId: "history", reason: "selection" });
reset(onPos);
const overviewHistoryAuth = onPos.answerQuestion("What was the Card present auth rate?");
expect(
  "Overview Ask Data auth answer uses Available history when selected",
  overviewHistoryAuth,
  new RegExp(dashboard.periods.ytd.label)
);

const posWeek = dashboard.periods.weeks.at(-3);
onPos.emitPeriod({ tabId: "pos", periodId: posWeek.id, reason: "selection" });
if (onPos.selectedPeriodId() !== posWeek.id) {
  failures.push({
    name: "non-Worldpay tab periods also update shared dashboard state",
    expected: posWeek.id,
    actual: onPos.selectedPeriodId(),
  });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Channel-agnostic chatbot smoke checks passed");
