/* Channel tab switching and tab-aware period coordination. */

(function () {
const periodsByTab = {};
let activeTabId = "overview";
let periodListenerAttached = false;
let historySelectedByUser = false;

function optionForPeriod(period) {
  const option = document.createElement("option");
  option.value = period.id;
  option.textContent = period.label;
  return option;
}

function announcePeriod(periodId, tabId = activeTabId, reason = "selection") {
  window.dispatchEvent(
    new CustomEvent("dashboard:period", { detail: { periodId, tabId, reason } })
  );
}

function populateSelect(tabId, reason = "periods-registered") {
  const select = document.getElementById("period-select");
  if (!select) return null;
  const periods = periodsByTab[tabId] || [];
  if (!periods.length) {
    select.replaceChildren();
    return null;
  }
  const wanted = select.value;
  select.replaceChildren(
    ...periods.map(optionForPeriod),
    optionForPeriod({ id: "history", label: "Available history" })
  );
  select.value = historySelectedByUser
    ? "history"
    : periods.some((item) => item.id === wanted)
    ? wanted
    : periods.at(-1).id;
  announcePeriod(select.value, tabId, reason);
  return select.value;
}

function registerPeriods(tabId, periods) {
  periodsByTab[tabId] = periods;
  if (tabId === activeTabId) populateSelect(tabId);
}

function getPeriods(tabId) {
  return periodsByTab[tabId] || [];
}

function activate(tabId) {
  const tabs = document.querySelectorAll(".tab[data-tab]");
  const panels = document.querySelectorAll(".tab-panel[data-panel]");
  if (!tabs.length || !panels.length) return;
  activeTabId = tabId;

  for (const tab of tabs) {
    const isActive = tab.dataset.tab === tabId;
    tab.classList.toggle("active", isActive);
    if (isActive) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  for (const panel of panels) {
    panel.hidden = panel.dataset.panel !== tabId;
  }

  // The period control drives every channel, so it stays visible on all tabs.

  const periodId = populateSelect(tabId, "tab-activation");
  window.dispatchEvent(new CustomEvent("dashboard:tab", { detail: { tabId, periodId } }));
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab[data-tab]");
  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  }
  const select = document.getElementById("period-select");
  if (select && !periodListenerAttached) {
    select.addEventListener("change", () => {
      const hasPeriods = Boolean(periodsByTab[activeTabId]?.length);
      historySelectedByUser = hasPeriods && select.value === "history";
      if (hasPeriods && select.value) announcePeriod(select.value, activeTabId);
    });
    periodListenerAttached = true;
  }
  const active = document.querySelector(".tab[data-tab].active");
  activate(active ? active.dataset.tab : "overview");
}

window.__dashboardTabs = { activate, getPeriods, registerPeriods };

window.addEventListener("dashboard:periods", (event) => {
  const tabId = event.detail?.tabId;
  const periods = event.detail?.periods;
  if (tabId && Array.isArray(periods)) registerPeriods(tabId, periods);
});

document.addEventListener("DOMContentLoaded", initTabs);
})();
