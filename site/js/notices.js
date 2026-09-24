/* Shared notice UI: plain-language message up front, technical detail behind a toggle.
   Used by every channel tab so failures read the same way. */

(function () {
function escapeHtml(value) {
  return String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} options
 * @param {string} options.title      Plain-language headline, no jargon.
 * @param {string} [options.message]  One friendly sentence about what this means.
 * @param {string} [options.technical] Raw error text, status code, or file path.
 * @param {string[]} [options.fix]    Steps to resolve, shown with the technical detail.
 */
function noticeHtml({ title, message, technical, fix }) {
  const steps = (fix || []).filter(Boolean);
  const hasDetail = Boolean(technical) || steps.length > 0;
  const detail = hasDetail
    ? `<details class="notice-details">
        <summary>Technical details and how to fix this</summary>
        <div class="notice-detail-body">
          ${technical ? `<p class="notice-tech-label">What the page reported</p><pre class="notice-tech">${escapeHtml(technical)}</pre>` : ""}
          ${
            steps.length
              ? `<p class="notice-tech-label">How to fix it</p><ol class="notice-fix">${steps
                  .map((step) => `<li>${step}</li>`)
                  .join("")}</ol>`
              : ""
          }
        </div>
      </details>`
    : "";

  return `<div class="notice-body">
      <h3>${escapeHtml(title)}</h3>
      ${message ? `<p>${escapeHtml(message)}</p>` : ""}
      ${detail}
    </div>`;
}

function renderNotice(target, options) {
  const el = typeof target === "string" ? document.getElementById(target) : target;
  if (!el) return null;
  el.innerHTML = noticeHtml(options);
  el.hidden = false;
  return el;
}

window.__notices = { noticeHtml, renderNotice, escapeHtml };
})();
