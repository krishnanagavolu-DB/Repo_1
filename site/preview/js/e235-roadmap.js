/* Payment Devices sub-tabs and the E235 Roadmap view, rendered from a weekly JSON drop. */

(function () {
const DATA_URL = "data/e235_roadmap.json";
const DEFAULT_SUBTAB = "e235-burndown";
const STATUS_LABEL = {
  done: "Done",
  current: "Now",
  next: "Next",
  then: "Then",
  later: "Later",
};

let loaded = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  if (!year || !month) return String(iso);
  return new Date(year, month - 1, day || 1).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function activateSubtab(name) {
  const tabs = document.querySelectorAll(".subtab[data-subtab]");
  const panels = document.querySelectorAll(".subpanel[data-subpanel]");
  if (!tabs.length) return;
  const wanted = [...tabs].some((tab) => tab.dataset.subtab === name) ? name : DEFAULT_SUBTAB;
  for (const tab of tabs) {
    const active = tab.dataset.subtab === wanted;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
    tab.tabIndex = active ? 0 : -1;
  }
  for (const panel of panels) panel.hidden = panel.dataset.subpanel !== wanted;
  if (document.body?.dataset) document.body.dataset.devicesView = wanted;
  window.dispatchEvent(new CustomEvent("dashboard:devices-view", { detail: { view: wanted } }));
}

function bindSubtabs() {
  const tabs = [...document.querySelectorAll(".subtab[data-subtab]")];
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => activateSubtab(tab.dataset.subtab));
    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      const step = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + step + tabs.length) % tabs.length];
      activateSubtab(next.dataset.subtab);
      next.focus();
    });
  });
  for (const link of document.querySelectorAll("[data-subtab-target]")) {
    link.addEventListener("click", () => activateSubtab(link.dataset.subtabTarget));
  }
  activateSubtab(DEFAULT_SUBTAB);
}

function stageCard(stage) {
  const aka = stage.aka ? `<span class="roadmap-aka">aka ${escapeHtml(stage.aka)}</span>` : "";
  return `
    <article class="roadmap-stage roadmap-${escapeHtml(stage.status)}">
      <div class="roadmap-stage-phase">${escapeHtml(stage.phase)}</div>
      <h4>${escapeHtml(stage.name)} ${aka}</h4>
      <p>${escapeHtml(stage.definition)}</p>
    </article>`;
}

function sequenceRow(stage, index, columns) {
  const column = Math.max(0, columns.indexOf(stage.column));
  const span = column < columns.length - 1 ? 2 : 1;
  const milestones = (stage.milestones || [])
    .map((item) => `<li>${escapeHtml(item)}</li>`)
    .join("");
  return `
    <div class="roadmap-row">
      <div class="roadmap-row-name">${escapeHtml(stage.name)}</div>
      <div class="roadmap-row-track" style="--roadmap-col:${column + 1};--roadmap-span:${span}">
        <div class="roadmap-bar roadmap-${escapeHtml(stage.status)}" data-step="${index + 1}">
          <span class="visually-hidden">${escapeHtml(STATUS_LABEL[stage.status] || stage.column)}: </span>
          <ul>${milestones}</ul>
        </div>
      </div>
    </div>`;
}

function sequenceColumns(stages) {
  const columns = [];
  for (const stage of stages) {
    if (stage.column && !columns.includes(stage.column)) columns.push(stage.column);
  }
  return columns;
}

function listItems(items) {
  return (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function setHtml(id, html) {
  const node = document.getElementById(id);
  if (node) node.innerHTML = html;
}

function setText(id, text) {
  const node = document.getElementById(id);
  if (node) node.textContent = text;
}

function renderRoadmap(payload) {
  const stages = payload?.stages || [];
  const columns = sequenceColumns(stages);
  setText("roadmap-asof", `As of ${fmtDate(payload.as_of)}`);
  setHtml("roadmap-stages", stages.map(stageCard).join(""));
  setText("roadmap-sequence-note", payload.sequence_note || "");
  setHtml(
    "roadmap-sequence",
    `<div class="roadmap-row roadmap-row-head">
       <div class="roadmap-row-name"></div>
       <div class="roadmap-heads">${columns.map((name) => `<span>${escapeHtml(name)}</span>`).join("")}</div>
     </div>` + stages.map((stage, index) => sequenceRow(stage, index, columns)).join("")
  );
  const sequence = document.getElementById("roadmap-sequence");
  if (sequence) sequence.style.setProperty("--roadmap-cols", String(columns.length || 1));
  setText("roadmap-commitments-title", payload.commitments_title || "Dates and commitments");
  setHtml("roadmap-commitments", listItems(payload.commitments));
  setHtml("roadmap-assumptions", listItems(payload.assumptions));
  setHtml("roadmap-questions", listItems(payload.open_questions));
  setText("roadmap-source", `Source: ${payload.source || payload.source_file || "E235 roadmap"} · updated weekly`);
  const empty = document.getElementById("roadmap-empty");
  const content = document.getElementById("roadmap-content");
  if (empty) empty.hidden = true;
  if (content) content.hidden = false;
}

function showEmpty(message) {
  const empty = document.getElementById("roadmap-empty");
  const content = document.getElementById("roadmap-content");
  if (content) content.hidden = true;
  if (!empty) return;
  empty.hidden = false;
  empty.innerHTML = `<h3>E235 Roadmap could not load</h3><p>${escapeHtml(message)}</p>`;
}

async function loadRoadmap() {
  if (loaded) return;
  loaded = true;
  try {
    const payload = await window.__dashboardAuth.loadJson(DATA_URL);
    window.__e235RoadmapState = payload;
    renderRoadmap(payload);
  } catch (error) {
    loaded = false;
    showEmpty(
      Number(error?.status) === 404
        ? "Drop e235_roadmap_YYYYMMDD.json into data/raw/e235-roadmap/ and run scripts/import_e235_roadmap.py."
        : error?.message || "The encrypted roadmap could not be opened."
    );
  }
}

function start() {
  bindSubtabs();
  if (document.body.classList.contains("auth-unlocked")) loadRoadmap();
  else window.addEventListener("dashboard:unlocked", loadRoadmap, { once: true });
}

window.__e235Roadmap = {
  activateSubtab,
  renderRoadmap,
  sequenceColumns,
  stageCard,
  sequenceRow,
  escapeHtml,
  DEFAULT_SUBTAB,
};

document.addEventListener("DOMContentLoaded", start);
})();
