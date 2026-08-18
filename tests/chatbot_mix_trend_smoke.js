/* Mix questions asked over time ("trend of Android Pay over the last 4 weeks")
   must read the weekly series, not fall back to a definition. */

const fs = require("fs");
const vm = require("vm");

const dashboard = JSON.parse(fs.readFileSync("site/preview/data/dashboard.json", "utf8"));
const benchmarks = JSON.parse(fs.readFileSync("site/preview/data/benchmarks.json", "utf8"));

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
vm.runInContext(fs.readFileSync("site/preview/js/chatbot.js", "utf8"), sandbox);

const ask = sandbox.window.__paymentsChat.answerQuestion;
const chatContext = sandbox.window.__paymentsChat.chatContext;
const failures = [];

const weeks = dashboard.periods.weeks;
const walletOf = (week, label) => week.wallet_mix.find((row) => row.label === label);
const androidFirst = walletOf(weeks.at(-4), "Android Pay (Google)");
const androidLast = walletOf(weeks.at(-1), "Android Pay (Google)");
const fmt = (value) => `${(value * 100).toFixed(1)}%`;

function ask_(question) {
  chatContext.topic = null;
  chatContext.mixKind = null;
  return ask(question);
}

function check(name, question, expected) {
  const answer = ask_(question);
  if (!expected.test(answer)) {
    failures.push({ name, question, expected: String(expected), answer });
  }
}

// The exact question that returned only a definition before.
check(
  "android pay trend",
  "what is the trend of Android pay in Wallet mix over the last 4 weeks?",
  new RegExp(`${fmt(androidFirst.pct)}[\\s\\S]*${fmt(androidLast.pct)}`)
);
check(
  "android pay trend names the wallet",
  "what is the trend of Android pay in Wallet mix over the last 4 weeks?",
  /Android Pay/i
);
check(
  "android pay trend is not a definition",
  "what is the trend of Android pay in Wallet mix over the last 4 weeks?",
  /week|trend/i
);

// Other phrasings and other mixes.
check("apple pay over time", "How has Apple Pay changed over time?", /Apple Pay[\s\S]*%/);
check("apple pay week over week", "Apple Pay trend by week", /Apple Pay[\s\S]*%/);
check("contactless trend", "Show the contactless trend over the last 4 weeks", /Contactless[\s\S]*%/);
check("visa trend", "What is the Visa trend over the last few weeks?", /Visa[\s\S]*%/);

// A trend answer must be reformattable, like every other series.
ask_("what is the trend of Android pay in Wallet mix over the last 4 weeks?");
const table = ask("Show that as a table");
if (!/table view/i.test(table) || !/Android Pay/i.test(table)) {
  failures.push({ name: "trend is reformattable", answer: table });
}

// Plain mix questions must keep working.
check("wallet mix snapshot", "Show wallet mix", /Apple Pay/);
check("single wallet share", "How many Apple Pay transactions?", /transactions/);
check("wallet definition still available", "What is wallet mix?", /Share of sales transactions/i);

// Never invent a series for something the feed does not carry.
const unknown = ask_("What is the trend of Venmo in wallet mix?");
if (/\d+\.\d%\s*→/.test(unknown)) {
  failures.push({ name: "unknown wallet invents a series", answer: unknown });
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Mix trend chatbot smoke checks passed");
