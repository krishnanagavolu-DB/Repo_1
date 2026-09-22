const fs = require("fs");
const vm = require("vm");

const failures = [];
const listeners = {};
const events = [];
let domPresent = true;

function check(name, actual, expected) {
  if (actual !== expected) failures.push({ name, expected, actual });
}

function classList(active = false) {
  const values = new Set(active ? ["active"] : []);
  return {
    contains(value) {
      return values.has(value);
    },
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
  };
}

const select = {
  options: [],
  value: "",
  addEventListener(type, handler) {
    listeners[`select:${type}`] = handler;
  },
  replaceChildren(...options) {
    this.options = options;
    this.value = "";
  },
};

const tabs = [
  {
    dataset: { tab: "pos" },
    classList: classList(true),
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
  },
  {
    dataset: { tab: "worldpay" },
    classList: classList(),
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
  },
];
const panels = [
  { dataset: { panel: "pos" }, hidden: false },
  { dataset: { panel: "worldpay" }, hidden: true },
];

const sandbox = {
  console,
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init?.detail;
    }
  },
  window: {
    addEventListener(type, handler) {
      listeners[`window:${type}`] = handler;
    },
    dispatchEvent(event) {
      events.push(event);
    },
  },
  document: {
    addEventListener(type, handler) {
      listeners[`document:${type}`] = handler;
    },
    createElement() {
      return { value: "", textContent: "" };
    },
    getElementById(id) {
      return id === "period-select" ? select : null;
    },
    querySelectorAll(selector) {
      if (!domPresent) return [];
      return selector.includes("tab-panel") ? panels : tabs;
    },
    querySelector() {
      return tabs[0];
    },
  },
};

vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("site/preview/js/tabs.js", "utf8"), sandbox);
listeners["document:DOMContentLoaded"]?.();

const coordinator = sandbox.window.__dashboardTabs;
coordinator.registerPeriods("pos", [
  { id: "2026-08-31", label: "Aug 31 – Sep 6, 2026" },
  { id: "2026-09-07", label: "Sep 7 – Sep 13, 2026" },
]);
coordinator.registerPeriods("worldpay", [
  { id: "2026-09-07", label: "Sep 7 – Sep 13, 2026" },
]);
coordinator.activate("pos");
check("POS offers its weeks plus history", select.options.length, 3);
check("latest POS week is selected", select.value, "2026-09-07");
select.value = "2026-08-31";
coordinator.activate("worldpay");
check("invalid date falls back to latest Worldpay", select.value, "2026-09-07");
check("history option copy", select.options.at(-1).textContent, "Available history");
check("registered periods are readable", coordinator.getPeriods("worldpay").length, 1);

listeners["window:dashboard:periods"]?.({
  detail: {
    tabId: "olo",
    periods: [{ id: "2026-09-14", label: "Sep 14 – Sep 20, 2026" }],
  },
});
check("period events populate registry", coordinator.getPeriods("olo").length, 1);

select.value = "history";
listeners["select:change"]?.();
const periodEvent = events.filter((event) => event.type === "dashboard:period").at(-1);
check("period event includes selected period", periodEvent?.detail?.periodId, "history");
check("period event includes active tab", periodEvent?.detail?.tabId, "worldpay");

const eventCount = events.length;
domPresent = false;
coordinator.activate("pos");
check("activation is inert without tab DOM", events.length, eventCount);

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("Tab period coordinator smoke checks passed");
