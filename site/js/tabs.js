/* Channel tab switching. The period control only drives the Worldpay panel. */

(function () {
function activate(tabId) {
  const tabs = document.querySelectorAll(".tab[data-tab]");
  const panels = document.querySelectorAll(".tab-panel[data-panel]");
  if (!tabs.length || !panels.length) return;

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

  window.dispatchEvent(new CustomEvent("dashboard:tab", { detail: { tabId } }));
}

function initTabs() {
  const tabs = document.querySelectorAll(".tab[data-tab]");
  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab.dataset.tab));
  }
  const active = document.querySelector(".tab[data-tab].active");
  activate(active ? active.dataset.tab : "pos");
}

window.__dashboardTabs = { activate };

document.addEventListener("DOMContentLoaded", initTabs);
})();
