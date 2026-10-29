const fs = require("fs");
const vm = require("vm");

const failures = [];

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

const html = fs.readFileSync("site/preview/index.html", "utf8");

// Payment Devices is an In Shop channel, so it sits inside that tab group.
const inShop = html.slice(html.indexOf('aria-label="In Shop"'), html.indexOf('data-tab="olo"'));
check("Payment Devices is inside the In Shop group", inShop.includes('data-tab="devices"'), true);
check("Payment Devices appears once in the nav", (html.match(/data-tab="devices"/g) || []).length, 1);

const subtabs = [...html.matchAll(/data-subtab="([\w-]+)"/g)].map((match) => match[1]);
check("three device views in order", subtabs.join(","), "e235-burndown,e285-burndown,e235-roadmap");
check("E285 PO Burn down is selected by default", /class="subtab active"[^>]*data-subtab="e235-burndown"[^>]*aria-selected="true"/.test(html), true);
check("view labels", [">E285 PO Burn down<", ">E285 Burn Down<", ">E235 Roadmap<"].every((label) => html.includes(label)), true);

const e235Start = html.indexOf('data-subpanel="e235-burndown"');
const e285Start = html.indexOf('data-subpanel="e285-burndown"');
const e235Panel = html.slice(e235Start, e285Start);
const e285Panel = html.slice(e285Start, html.indexOf('data-subpanel="e235-roadmap"'));
check("burn down chart is the default E235 view", e235Panel.includes('id="chart-devices-burndown"'), true);
check("E235 view is visible by default", /data-subpanel="e235-burndown"[^>]*hidden/.test(e235Panel), false);
check("E285 view says coming soon", e285Panel.includes(">Coming soon<") && !e285Panel.includes(">In progress<"), true);
check("E285 view starts hidden", /data-subpanel="e285-burndown"[^>]*hidden/.test(html), true);
check("roadmap view starts hidden", /data-subpanel="e235-roadmap"[^>]*hidden/.test(html), true);
check("roadmap script is loaded", html.includes('src="js/e235-roadmap.js'), true);

function fakeElement(dataset, hidden = false) {
  const classes = new Set();
  return {
    dataset,
    hidden,
    tabIndex: 0,
    attrs: {},
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains: (name) => classes.has(name),
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    addEventListener() {},
  };
}

const tabs = ["e235-burndown", "e285-burndown", "e235-roadmap"].map((name) => fakeElement({ subtab: name }));
const panels = ["e235-burndown", "e285-burndown", "e235-roadmap"].map((name) => fakeElement({ subpanel: name }));
const sandbox = {
  console,
  CustomEvent: class CustomEvent {},
  window: { addEventListener() {}, dispatchEvent() {}, __dashboardAuth: { loadJson: async () => ({}) } },
  document: {
    addEventListener() {},
    body: { dataset: {}, classList: { contains: () => false } },
    getElementById: () => null,
    querySelectorAll(selector) {
      if (selector.startsWith(".subtab[")) return tabs;
      if (selector.startsWith(".subpanel[")) return panels;
      return [];
    },
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/e235-roadmap.js", "utf8"), sandbox);
const api = sandbox.window.__e235Roadmap;

check("default view constant", api.DEFAULT_SUBTAB, "e235-burndown");
api.activateSubtab("e235-roadmap");
check("roadmap tab is selected", tabs[2].attrs["aria-selected"], "true");
check("burn down tab is deselected", tabs[0].attrs["aria-selected"], "false");
check("only the roadmap panel shows", panels.map((panel) => panel.hidden).join(","), "true,true,false");
api.activateSubtab("not-a-view");
check("unknown view falls back to E285 PO Burn down", panels.map((panel) => panel.hidden).join(","), "false,true,true");

const roadmap = JSON.parse(fs.readFileSync("data/processed/e235_roadmap.json", "utf8"));
const columns = api.sequenceColumns(roadmap.stages);
check("sequence columns follow the PDF", columns.join(","), "Done,Now,Next,Then,Later");
const current = roadmap.stages.find((stage) => stage.status === "current");
check("pre-prod is the current stage", current.name, "Pre-prod");
check("stage card shows the aka", api.stageCard(current).includes("aka Golden units"), true);
check("current stage card is highlighted", api.stageCard(current).includes("roadmap-current"), true);
check("last stage bar does not overflow the grid", api.sequenceRow(roadmap.stages.at(-1), 4, columns).includes("--roadmap-span:1"), true);
check("earlier bars step across two columns", api.sequenceRow(roadmap.stages[0], 0, columns).includes("--roadmap-col:1;--roadmap-span:2"), true);
check("roadmap text is escaped", api.escapeHtml("<b>&"), "&lt;b&gt;&amp;");

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("Payment device views smoke checks passed");
