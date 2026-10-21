const fs = require("fs");
const vm = require("vm");

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const html = fs.readFileSync("site/preview/index.html", "utf8");
check("DB Payments tab exists", html.includes('data-tab="dbpay"'), true);
check("DB Payments panel exists", html.includes('data-panel="dbpay"'), true);
check("DB Payments asks for its own key", html.includes('id="dbpay-password"'), true);
check("DB Payments content starts hidden", /id="dbpay-content"[^>]*hidden/.test(html), true);
check("db-payments script is loaded", html.includes('src="js/db-payments.js'), true);

const leadership = fs.readFileSync("site/index.html", "utf8");
check("leadership page has no DB Payments tab", leadership.includes("dbpay"), false);

const css = fs.readFileSync("site/preview/css/dashboard.css", "utf8");
check("chat is hidden on DB Payments", /body\[data-active-tab="dbpay"\] \.ask-data/.test(css), true);

const gate = fs.readFileSync("site/preview/js/auth-gate.js", "utf8");
check("private payloads open with their own key", gate.includes("loadPrivateJson"), true);

const envelope = JSON.parse(fs.readFileSync("site/preview/data/db_payments.json", "utf8"));
check("published DB Payments is encrypted", envelope.enc, "db-dash-v1");
check("published DB Payments has no plaintext updates", "updates" in envelope, false);

const source = fs.readFileSync("site/preview/js/db-payments.js", "utf8");
check("unlock is remembered only for the browser session", source.includes("sessionStorage") && !source.includes("localStorage"), true);
check("no password hash is shipped for DB Payments", /passwordHash|sha256Hex/.test(source), false);

const sandbox = {
  console,
  window: { addEventListener() {}, __dashboardAuth: {} },
  document: { addEventListener() {}, getElementById: () => null },
  sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);
const api = sandbox.window.__dbPayments;

check("week label spans Monday to Sunday", api.weekLabel("2026-10-19"), "Week of Oct 19 – Oct 25, 2026");
const card = api.updateCard({
  week_start: "2026-10-19",
  summary: "Week <one>",
  items: [{ area: "Card Health", status: "in progress", text: "Load Oct 19" }],
  next: ["Promote Order Ahead"],
  asks: ["Ravi to confirm lease"],
});
check("update card escapes text", card.includes("Week &lt;one&gt;"), true);
check("status chip is labelled", card.includes(">In progress<"), true);
check("status chip class has no spaces", card.includes("dbpay-status-in-progress"), true);
check("asks are listed", card.includes("Ravi to confirm lease"), true);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("DB Payments smoke checks passed");
