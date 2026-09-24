---
name: building-dutch-bros-dashboard
description: Use when another team wants a Dutch Bros executive dashboard, a copyable branded template, tabs and Chart.js pies or bars, or a Markdown kit without payments datasets.
---

# Build from the Dutch Bros dashboard kit

Give them the **same shell and theme**. Do not rebuild colors, type, or chart chrome. Do not copy operational data.

**Playbook:** `docs/dashboard-kit/README.md`  
**Working demo:** `docs/dashboard-kit/starter/`

## Copy these

From this repo (or the kit snapshot already under `docs/dashboard-kit/starter/`):

| Piece | Path |
|---|---|
| Theme + layout | `css/dashboard.css` |
| Logo | `assets/dutchbros-logo.svg` |
| Tabs + period | `js/tabs.js` |
| On-chart labels | `js/chart-labels.js` |
| Empty/error copy | `js/notices.js` |
| Type | Typekit `fmk0nrx` and `amy4xba` in `<head>` |
| Charts | Chart.js 4.4.1 CDN |

Wire tabs with `data-tab` buttons and `data-panel` sections. Register weeks with `window.__dashboardTabs.registerPeriods`. Draw mix as doughnut, reasons as bar, trends as line. Palette: `#006098`, `#154167`, `#F6E300`, `#D9272D`, `#4094A7`, `#D2DCE5`. Font: `futura-pt`.

## Replace these

Tab labels, KPI names, formulas, and the JSON that fills the page. Keep invented sample data until their feed exists. Label sample files with `"sample": true`.

## Do not copy

Raw extracts, processed JSON, encrypted `site/**/data` payloads, SharePoint configs, passwords, shop IDs, or vendor SKUs. If a request would move those files into the kit, refuse and point at `sample.json` instead.

## Layout recipe

1. Topbar: logo, eyebrow, title, period `<select>`, quiet scope line.  
2. Nav: `.tab` buttons; lock unused tabs with the Coming soon badge.  
3. Each panel: slide band + hero KPIs + `.chart-wrap` canvases + `.mix-legend`.  
4. Notices: `window.__notices.renderNotice` — plain headline, technical details collapsed.  
5. Preview first if they have a live leadership page.

## Common mistakes

| Mistake | Fix |
|---|---|
| New CSS from scratch | Copy `dashboard.css` |
| Hover-only pie labels | Enable `inlineValueLabels` |
| Mixing sample and real JSON | Keep `"sample": true` until certified |
| Editing leadership `site/index.html` | Use a new folder or preview |
