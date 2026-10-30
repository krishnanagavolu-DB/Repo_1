const fs = require("fs");
const vm = require("vm");

const dashboard = JSON.parse(fs.readFileSync("data/processed/dashboard.json", "utf8"));
const benchmarks = JSON.parse(fs.readFileSync("data/processed/benchmarks.json", "utf8"));
const deviceHealth = JSON.parse(fs.readFileSync("data/processed/device_health.json", "utf8"));
const paymentDevices = JSON.parse(fs.readFileSync("data/processed/payment_devices.json", "utf8"));

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
    __deviceHealthState: deviceHealth,
    __paymentDevicesState: paymentDevices,
  },
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

// Chat trends read the last six history points, so a weekly refresh moves these.
const authTrendWindow = latest.kpis.auth_rate.history.slice(-6);
const bestAuthRate = Math.max(...authTrendWindow.map(({ value }) => value));
const formattedBestAuthRate = `${(bestAuthRate * 100).toFixed(2)}%`;
const icFeePerTransaction = latest.kpis.ic_fee.value / latest.kpis.transaction_volume.value;
const formattedIcFeePerTransaction = `$${icFeePerTransaction.toFixed(2)}`;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const terminalCount = (value) => Math.round(Number(value)).toLocaleString("en-US");

// The tab coordinator emits "history"; chatbot answers must use the aggregate.
sandbox.window.__dashboardState.periodId = "history";
const historyAnswer = ask("Card present auth rate");
sandbox.window.__dashboardState.periodId = "ytd";
const legacyYtdAnswer = ask("Card present auth rate");
sandbox.window.__dashboardState.periodId = latest.id;

const checks = [
  [
    "Explain the auth rate trend",
    new RegExp(`Best: \\*\\*${escapeRegExp(formattedBestAuthRate)}\\*\\*`),
  ],
  ["Show decline reasons as percentages", /% of declined requests/],
  [
    "How many Apple Pay transactions?",
    new RegExp(`${escapeRegExp(formattedApplePayCount)} transactions`),
  ],
  [
    "What are IC fees per transaction?",
    new RegExp(`${escapeRegExp(formattedIcFeePerTransaction)} per sales transaction`),
  ],
  ["How does our auth rate compare with industry benchmarks?", /Directional authorization context/],
  ["Compare us with Starbucks, Dunkin, and 7 Brew", /Starbucks Card/],
  ["Is this data certified?", /Certified for publish: \*\*Yes\*\*/],
  ["Show decline reasons", new RegExp(escapeRegExp(formattedTopDeclineCount))],
  ["Show that as visual bars", /█/],
  ["Show wallet mix", /Physical Card/],
  ["Show that as a table", /table view/],
  ["Show the POS tender mix", /All payments data isn’t published yet|All payments tender mix/],
  ["What is All payments?", /In-Shop Sales.*Company-owned POS sales.*Gold Semantic Sales/i],
  ["help", /every channel tab/i],
  // The terminals card hides the unconfirmed bucket, so the chat has to answer
  // for it, and the installed base must not be served as the purchase order.
  [
    "How many E285 terminals do we have?",
    new RegExp(`${escapeRegExp(terminalCount(deviceHealth.e285.total))} E285 terminals`),
  ],
  [
    "What does location not confirmed mean?",
    new RegExp(`not a lost-device count[\\s\\S]*${escapeRegExp(terminalCount(deviceHealth.e285.total))} total`),
  ],
  [
    "How many terminals are available to ship?",
    new RegExp(`\\*\\*${escapeRegExp(terminalCount(deviceHealth.e285.available_to_ship))} available to ship\\*\\*`),
  ],
  [
    "How many Verifone e285 units do we still have?",
    new RegExp(`${escapeRegExp(terminalCount(paymentDevices.summary.firm_inventory))}`),
  ],
];

const failures = [];
if (!historyAnswer.includes(dashboard.periods.ytd.label)) {
  failures.push({
    question: "Show auth rate with history selected",
    expected: dashboard.periods.ytd.label,
    answer: historyAnswer,
  });
}
if (!legacyYtdAnswer.includes(dashboard.periods.ytd.label)) {
  failures.push({
    question: "Show auth rate with legacy ytd selected",
    expected: dashboard.periods.ytd.label,
    answer: legacyYtdAnswer,
  });
}
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
