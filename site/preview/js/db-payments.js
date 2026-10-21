/* DB Payments: Ravi's weekly updates, opened with a second key separate from the dashboard key. */

(function () {
const DATA_URL = "data/db_payments.json";
const SESSION_KEY = "db_payments_key_v1";
const STATUS_LABEL = {
  done: "Done",
  "in progress": "In progress",
  blocked: "Blocked",
  next: "Next",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function weekLabel(iso) {
  const [year, month, day] = String(iso || "").slice(0, 10).split("-").map(Number);
  if (!year || !month) return iso || "—";
  const start = new Date(year, month - 1, day || 1);
  const end = new Date(year, month - 1, (day || 1) + 6);
  const short = (date) => date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `Week of ${short(start)} – ${short(end)}, ${end.getFullYear()}`;
}

function list(title, items, className) {
  if (!items?.length) return "";
  return `
    <div class="dbpay-list ${className}">
      <h4>${escapeHtml(title)}</h4>
      <ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </div>`;
}

function itemRow(item) {
  const status = String(item.status || "").toLowerCase();
  const area = item.area ? `<span class="dbpay-area">${escapeHtml(item.area)}</span>` : "";
  return `
    <li class="dbpay-item">
      <span class="dbpay-status dbpay-status-${escapeHtml(status.replace(/\s+/g, "-"))}">${escapeHtml(STATUS_LABEL[status] || item.status)}</span>
      ${area}
      <span class="dbpay-text">${escapeHtml(item.text)}</span>
    </li>`;
}

function updateCard(update) {
  const sent = update.sent_on ? `<span class="dbpay-sent">Sent ${escapeHtml(update.sent_on)}</span>` : "";
  const items = update.items?.length ? `<ul class="dbpay-items">${update.items.map(itemRow).join("")}</ul>` : "";
  return `
    <article class="dbpay-update">
      <header>
        <h3>${escapeHtml(weekLabel(update.week_start))}</h3>
        ${sent}
      </header>
      <p class="dbpay-summary">${escapeHtml(update.summary)}</p>
      ${items}
      <div class="dbpay-lists">
        ${list("Next week", update.next, "dbpay-next")}
        ${list("Asks", update.asks, "dbpay-asks")}
      </div>
    </article>`;
}

function renderUpdates(payload) {
  const updates = payload?.updates || [];
  const target = document.getElementById("dbpay-updates");
  if (!target) return;
  const subtitle = document.getElementById("dbpay-subtitle");
  if (subtitle) {
    subtitle.textContent = updates.length
      ? `Weekly updates for Ravi · latest ${weekLabel(payload.latest_week).replace("Week of ", "")}`
      : "Weekly updates for Ravi";
  }
  target.innerHTML = updates.length
    ? updates.map(updateCard).join("")
    : `<div class="dbpay-empty">
         <h3>No updates yet</h3>
         <p>Each week's update shows here, newest first, once it is added to data/raw/db-payments/.</p>
       </div>`;
}

function showLocked(message = "") {
  const lock = document.getElementById("dbpay-lock");
  const content = document.getElementById("dbpay-content");
  const error = document.getElementById("dbpay-error");
  if (lock) lock.hidden = false;
  if (content) content.hidden = true;
  if (error) {
    error.textContent = message;
    error.hidden = !message;
  }
}

function showUnlocked(payload) {
  renderUpdates(payload);
  const lock = document.getElementById("dbpay-lock");
  const content = document.getElementById("dbpay-content");
  if (lock) lock.hidden = true;
  if (content) content.hidden = false;
}

async function open(password) {
  const payload = await window.__dashboardAuth.loadPrivateJson(DATA_URL, password);
  sessionStorage.setItem(SESSION_KEY, password);
  showUnlocked(payload);
  return payload;
}

function lockAgain() {
  sessionStorage.removeItem(SESSION_KEY);
  const target = document.getElementById("dbpay-updates");
  if (target) target.innerHTML = "";
  showLocked();
}

function bind() {
  const form = document.getElementById("dbpay-form");
  const input = document.getElementById("dbpay-password");
  if (form && input) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const entered = input.value;
      if (!entered) {
        showLocked("Enter the DB Payments key.");
        return;
      }
      try {
        await open(entered);
        input.value = "";
      } catch (error) {
        showLocked(
          Number(error?.status) === 404
            ? "DB Payments has not been published yet."
            : "That key does not open DB Payments."
        );
        input.select();
      }
    });
  }
  document.getElementById("dbpay-lock-again")?.addEventListener("click", lockAgain);
}

async function resume() {
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (!saved) return;
  try {
    await open(saved);
  } catch (error) {
    sessionStorage.removeItem(SESSION_KEY);
  }
}

function start() {
  bind();
  showLocked();
  if (document.body.classList.contains("auth-unlocked")) resume();
  else window.addEventListener("dashboard:unlocked", resume, { once: true });
}

window.__dbPayments = { renderUpdates, updateCard, weekLabel, escapeHtml, lockAgain };

document.addEventListener("DOMContentLoaded", start);
})();
