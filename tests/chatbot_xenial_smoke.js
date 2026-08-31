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
const failures = [];

function check(question, expected) {
  const answer = ask(question);
  if (!expected.test(answer)) {
    failures.push({ question, expected: String(expected), answer });
  }
}

check("What is AVG_TICKET on All payments?", /payment lines|distinct ORDER_ID|guest checks/i);
check("What is the average ticket on All payments?", /\$10\.03|guest checks|payment lines/i);
check("What is TRANSACTION_COUNT?", /payment-fact|payment rows|Gold/i);
check("What is ORDER_COUNT?", /not published|guest checks|ORDER_ID/i);
check("Why are tips excluded from All payments?", /not drink sales|Worldpay/i);
check("Why is change excluded?", /cash handed back|not sales/i);
check("Why is Worldpay average ticket higher than POS?", /sale \+ tip|\$12\.15|tips/i);
check("Where does All payments data come from?", /Gold|Xenial|company-owned/i);
check("Is Apple Pay in the All payments tender mix?", /not|Worldpay|not in this KPI/i);
check("What is Dutch Pass?", /CUSTOM|window|wallet/i);
check("Will AVG_TICKET change next week?", /distinct.?ORDER_ID|orders|payment lines/i);
check("How many guest checks were there?", /ORDER_COUNT|not published|payment lines/i);
check("What is SALES_VOLUME on All payments?", /net|tips|change|\$10k|company-owned|CO/i);
check("What was AOV last week?", /AOV|\$12/i);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Xenial chatbot smoke checks passed: 14`);
