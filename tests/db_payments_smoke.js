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

const board = api.updateCard({
  week_start: "2026-10-26",
  summary: "Board",
  top_priorities: ["One", "Two", "Three"],
  projects: [
    { name: "OloPay Processing Transition", status: "On Hold", this_week: "No change." },
    { name: "e235 Stop Gap Validation", status: "In Progress", this_week: "Lab sign-off done." },
    { name: "Retired project", status: "Closed", this_week: "Gone." },
  ],
  side_quests: [{ name: "Stratix reporting", status: "In progress", this_week: "Cadence." }],
  wins: ["Visa closed"],
  stuck: ["VHQ time"],
  action_items: [{ owner: "Ravi", text: "Ask Verifone for the VHQ session." }],
  ravi_notes: [],
  open_detail: ["Ken Chambless: reply on iTrac."],
});
check("in-progress project is listed before on-hold", board.indexOf("e235 Stop Gap") < board.indexOf("OloPay Processing"), true);
check("closed project leaves the board", board.includes("Retired project"), false);
check("side quest table renders", board.includes("Stratix reporting") && board.includes("dbpay-table"), true);
check("empty Ravi section says nothing is filed", board.includes("Nothing filed yet"), true);
check("open detail collapses", board.includes('<details class="dbpay-detail">') && board.includes("Open detail (1)"), true);
check("action owner is shown", board.includes("dbpay-owner"), true);
check("on-hold status has its own style", board.includes("dbpay-status-on-hold"), true);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("DB Payments smoke checks passed");
