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
  window: { __benchmarkData: benchmarks },
  document: {
    addEventListener() {},
    querySelectorAll() {
      return [];
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
const latest = dashboard.periods.weeks.at(-1);
const applePayCount = latest.wallet_mix.find(({ label }) => label === "Apple Pay").count;
const topDeclineCount = latest.decline_reasons.at(0).count;
const formattedApplePayCount = new Intl.NumberFormat("en-US").format(applePayCount);
const formattedTopDeclineCount = new Intl.NumberFormat("en-US").format(topDeclineCount);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const checks = [
  ["Explain the auth rate trend", /Best: \*\*98\.71%\*\*/],
  ["Show decline reasons as percentages", /% of declined requests/],
  [
    "How many Apple Pay transactions?",
    new RegExp(`${escapeRegExp(formattedApplePayCount)} transactions`),
  ],
  ["What are IC fees per transaction?", /\$0\.24 per sales transaction/],
  ["How does our auth rate compare with industry benchmarks?", /Directional authorization context/],
  ["Compare us with Starbucks, Dunkin, and 7 Brew", /Starbucks Card/],
  ["Is this data certified?", /Certified for publish: \*\*Yes\*\*/],
  ["Show decline reasons", new RegExp(escapeRegExp(formattedTopDeclineCount))],
  ["Show that as visual bars", /█/],
  ["Show wallet mix", /Physical Card/],
  ["Show that as a table", /table view/],
  ["Show the POS tender mix", /All payments data isn’t published yet|All payments tender mix/],
  ["What is All payments?", /Every tender taken at company-owned shops/i],
  ["help", /every channel tab/i],
];

const failures = [];
for (const [question, expected] of checks) {
  const answer = ask(question);
  if (!expected.test(answer)) {
    failures.push({ question, expected: String(expected), answer });
  }
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Chatbot smoke checks passed: ${checks.length}`);
