/* Every tab must show a plain-language message first and hide technical text
   behind an expandable "Technical details" toggle. */

const fs = require("fs");
const vm = require("vm");

const sandbox = {
  console,
  String,
  Object,
  Array,
  window: {},
  document: { getElementById: () => null },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/notices.js", "utf8"), sandbox);

const { noticeHtml } = sandbox.window.__notices;
const failures = [];

const html = noticeHtml({
  title: "POS sales for this week aren't published yet",
  message: "Once the weekly POS export is loaded, tender mix will appear here.",
  technical: "Request for data/in_shop_sales_data.json returned HTTP 404.",
  fix: ["Run the import script.", "Commit and redeploy."],
});

function check(name, condition) {
  if (!condition) failures.push(name);
}

const summaryIndex = html.indexOf("<summary");
const technicalIndex = html.indexOf("HTTP 404");

check("headline is present", html.includes("POS sales for this week aren't published yet"));
check("friendly message is present", html.includes("tender mix will appear here"));
check("technical detail sits inside a details element", html.includes("<details"));
check("technical text appears after the summary toggle", summaryIndex !== -1 && technicalIndex > summaryIndex);
check("fix steps are listed", html.includes("Run the import script."));
check("details are collapsed by default", !html.includes("<details class=\"notice-details\" open"));

// Raw error text must be escaped so a stray tag cannot break the page.
const escaped = noticeHtml({ title: "Something went wrong", technical: "<script>alert(1)</script>" });
check("technical text is escaped", !escaped.includes("<script>"));

// With nothing technical to show, no empty toggle should render.
const plain = noticeHtml({ title: "All clear", message: "Nothing to report." });
check("no toggle without detail", !plain.includes("<details"));

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Notice smoke checks passed: 8`);
