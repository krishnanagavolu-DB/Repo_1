/* Access gate: password hash lives in auth-config.json (change via scripts/set_dashboard_password.py). */

const KEY_PHRASES = [
  // Hitchhiker's Guide
  "Don’t panic — but we do need the key. What’s the answer around here?",
  "The mice are waiting. Enter the key to life, the universe, and this dashboard.",
  "So long, and thanks for all the fish… after you type the key.",
  // Lord of the Rings / Harry Potter
  "Speak, friend, and enter — Dutch Bros edition. What’s the key?",
  "Not every door opens with Alohomora. This one wants the key.",
  "Mischief managed only after you produce the key.",
  "You’re a wizard, Broista — now cast the key.",
  // V for Vendetta
  "Remember, remember… the key to this page.",
  "A building is a symbol. This popup is a lock. Enter the key.",
  // Home Alone
  "Keep the change, ya filthy animal — kidding. We need the key.",
  "This is my house (dashboard). What’s the key, buzz?",
  // Robert Zemeckis
  "Roads? Where we’re going, we need a key.",
  "Great Scott! Enter the key before this DeLorean leaves.",
  "Life is like a box of… wait, wrong movie. Still need the key.",
  // Spielberg
  "You’re gonna need a bigger key.",
  "E.T. phone home — you phone in the key.",
  "This dashboard doesn’t phone home until you enter the key.",
  "We named the dog Indiana. We named the password… enter it.",
  // Dutch Bros flavor + misc
  "Broista checkpoint: drop the key to pour the numbers.",
  "Rebel-energy only beyond this point. What’s the key?",
  "No free samples of the KPIs — show us the key.",
];

function pickPhrase() {
  const i = Math.floor(Math.random() * KEY_PHRASES.length);
  return KEY_PHRASES[i];
}

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadConfig() {
  const res = await fetch("auth-config.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`Missing auth-config.json (${res.status})`);
  return res.json();
}

function unlockUi() {
  document.body.classList.remove("auth-locked");
  document.body.classList.add("auth-unlocked");
  const gate = document.getElementById("auth-gate");
  if (gate) gate.hidden = true;
  const page = document.querySelector(".page");
  if (page) page.removeAttribute("aria-hidden");
  const skeleton = document.getElementById("auth-skeleton");
  if (skeleton) skeleton.hidden = true;
  window.dispatchEvent(new CustomEvent("dashboard:unlocked"));
}

function showError(msg) {
  const el = document.getElementById("auth-error");
  if (!el) return;
  el.textContent = msg;
  el.hidden = !msg;
}

async function initAuthGate() {
  let config;
  try {
    config = await loadConfig();
  } catch (err) {
    document.body.classList.add("auth-locked");
    console.error(err);
    return;
  }

  const sessionKey = config.sessionKey || "db_wp_dashboard_auth_v1";
  const expected = String(config.passwordHash || "").toLowerCase();

  if (sessionStorage.getItem(sessionKey) === expected && expected) {
    unlockUi();
    return;
  }

  document.body.classList.add("auth-locked");
  const phraseEl = document.getElementById("auth-phrase");
  if (phraseEl) phraseEl.textContent = pickPhrase();

  const form = document.getElementById("auth-form");
  const input = document.getElementById("auth-password");
  if (!form || !input) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const entered = input.value;
    if (!entered) {
      showError("Enter the key to continue.");
      return;
    }
    const hash = await sha256Hex(entered);
    if (hash === expected) {
      sessionStorage.setItem(sessionKey, expected);
      input.value = "";
      unlockUi();
      return;
    }
    showError("That’s not the key. Try again — and don’t panic.");
    input.select();
  });

  input.focus();
}

document.addEventListener("DOMContentLoaded", initAuthGate);
