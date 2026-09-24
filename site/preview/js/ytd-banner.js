/* YTD banner: on every tab, say how far back the year-to-date aggregate reaches.
   Each channel registers its own coverage because feeds start on different weeks. */

(function () {
const coverageByTab = {};
let activeTabId = null;
let activePeriodId = null;

function buildMessage(coverage) {
  const startLabel = coverage?.startLabel;
  const weekCount = Number(coverage?.weekCount);
  if (!startLabel || !Number.isFinite(weekCount) || weekCount < 1) return null;
  const weekWord = weekCount === 1 ? "week" : "weeks";
  return `Fresh pour: YTD stacks up every week since ${startLabel} — ${weekCount} ${weekWord} in the cup so far.`;
}

function getCoverage(tabId) {
  return coverageByTab[tabId] || null;
}

function render() {
  const banner = document.getElementById("ytd-banner");
  if (!banner) return;
  const message = activePeriodId === "ytd" ? buildMessage(getCoverage(activeTabId)) : null;
  if (!message) {
    banner.hidden = true;
    banner.textContent = "";
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
}

function register(tabId, coverage) {
  coverageByTab[tabId] = coverage;
  render();
}

window.__ytdBanner = { buildMessage, getCoverage, register, render };

window.addEventListener("dashboard:tab", (event) => {
  activeTabId = event.detail?.tabId || activeTabId;
  render();
});

window.addEventListener("dashboard:period", (event) => {
  activePeriodId = event.detail?.periodId || activePeriodId;
  render();
});
})();
