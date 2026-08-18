# UI conventions

Rules that apply to every channel tab (POS Sales, In Shop Worldpay, and the tabs still to come).

## Error and empty states

**Never show a raw technical message as the headline.** Leadership should see plain language first;
anything technical belongs behind an expandable toggle together with the fix.

Every notice is built with the shared helper in `site/preview/js/notices.js`:

```js
window.__notices.renderNotice("pos-empty", {
  title: "POS sales for this week aren't published yet",     // plain language, no jargon
  message: "Once the weekly POS export is loaded, tender mix will appear here.",
  technical: "Request for data/in_shop_sales_data.json returned HTTP 404.",
  fix: [
    "Export the weekly file from Snowflake to <code>in_shop_sales_data.json</code>.",
    "Run <code>python3 scripts/import_pos_sales.py &lt;path&gt; --preview-only</code>.",
    "Commit the updated file and redeploy.",
  ],
});
```

Which renders as:

- **Headline** — what the reader is missing, in their words.
- **One sentence** — what to expect or try next.
- **"Technical details and how to fix this"** — collapsed by default. Expanding shows the raw
  error text and numbered fix steps.

Rules:

1. The headline and message must never contain a status code, file path, stack trace, or command.
2. The technical block must always name the underlying failure, so a screenshot of the expanded
   notice is enough for the data team to act on.
3. Fix steps must be runnable as written.
4. Raw error text is HTML-escaped by the helper. Do not bypass it by writing `innerHTML` directly.

`tests/notices_smoke.js` enforces the structure and runs in CI.

## Toggling visibility

Use the `hidden` attribute. `[hidden] { display: none !important; }` in `dashboard.css` ensures it
wins over layout rules such as `display: flex`, which otherwise leaves empty banners on screen.

## Ask about this data

The chatbot panel lives outside every tab panel so it is available on all channels. It answers
definitions, Worldpay KPIs, POS tender mix, cited industry benchmarks, and competitor research
regardless of which tab is active. Suggested prompts change with the active tab; the answer routing
does not.
