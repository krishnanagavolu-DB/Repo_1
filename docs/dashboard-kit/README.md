# Dutch Bros executive dashboard kit

Hand this folder (and the Cursor skill) to another team when they want the **same dashboard format**: Dutch Bros colors and type, tabs, KPI cards, pies, bars, and trend lines.

They should **not** copy payments datasets. The starter page uses invented numbers labeled as sample.

| Share this | Path |
|---|---|
| This playbook | `docs/dashboard-kit/README.md` |
| Working demo | `docs/dashboard-kit/starter/` |
| Cursor skill (theme + tabs) | `.cursor/skills/building-dutch-bros-dashboard/SKILL.md` |
| Cursor skill (GitLab Pages) | `.cursor/skills/hosting-gitlab-pages/SKILL.md` |
| Skills inside this kit | `docs/dashboard-kit/skills/` |
| GitLab Pages guide | `docs/dashboard-kit/GITLAB.md` |
| GitLab CI template | `docs/dashboard-kit/gitlab-ci.yml` |
| Design note | `docs/superpowers/specs/2026-09-24-dashboard-kit-design.md` |

## Open the demo

From the repo root:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/docs/dashboard-kit/starter/`. Or copy the `starter/` folder into another repo and serve that folder.

To put the same page on **GitLab Pages**, follow [`GITLAB.md`](GITLAB.md) and drop `.cursor/skills/hosting-gitlab-pages/` into the other team's Cursor skills.

Futura PT loads from Adobe Typekit (same kits as the payments preview). If typekit is blocked, the CSS falls back to Trebuchet / Segoe.

## What stays Dutch Bros

Copy these instead of inventing a new theme:

```css
--blue: #006098;
--navy: #154167;
--red: #d9272d;
--yellow: #f6e300;
--bg: #e8eef2;
--font: "futura-pt", "Futura PT", "Trebuchet MS", "Segoe UI", sans-serif;
```

Chart slice order:

`#006098`, `#154167`, `#F6E300`, `#D9272D`, `#4094A7`, `#D2DCE5`

Logo: `starter/assets/dutchbros-logo.svg`  
Full layout CSS: `starter/css/dashboard.css` (snapshot of the payments preview stylesheet)

Typekit in `<head>`:

```html
<link rel="stylesheet" href="https://use.typekit.net/fmk0nrx.css" />
<link rel="stylesheet" href="https://use.typekit.net/amy4xba.css" />
```

## Page skeleton (copy this shape)

1. **Topbar** — logo, eyebrow, title, period dropdown, one-line scope.
2. **Tabs** — `button.tab` with `data-tab="…"`. Unused work gets `locked` + Coming soon.
3. **Panels** — `section.tab-panel` with matching `data-panel`.
4. **Scorecards** — large value, label, week-over-week delta (include the number on downs).
5. **Charts** — wrap every `<canvas>` in `.chart-wrap`. Pair pies with a `.mix-legend` table.
6. **Detail** — optional `<details class="slide-detail">` for tables that do not belong on the first screen.

`js/tabs.js` switches panels and fires `dashboard:tab` / `dashboard:period`. Register weeks:

```js
window.__dashboardTabs.registerPeriods("scorecard", [
  { id: "2026-09-14", label: "Week of Sep 14" },
]);
```

## Chart recipes (Chart.js 4.4.1)

Include `chart-labels.js` so values print on the canvas (slides should not require hover).

| Need | Chart type | Notes |
|---|---|---|
| Mix (share of total) | `doughnut`, `cutout: "58%"` | Legend table next to the pie |
| Ranked reasons | `bar`, `indexAxis: "y"` | Full-width `.bar-chart` |
| Time series | `line` | One metric over sample weeks |
| Two series | `line` with two datasets | Solid = known, dashed = projected |

Turn labels on:

```js
plugins: {
  legend: { display: false },
  inlineValueLabels: {
    display: true,
    formatter: (value) => `${Number(value).toFixed(1)}%`,
  },
}
```

## Swap in their topic

Edit `starter/data/sample.json`: tab-facing labels, KPI strings, mix slices, bar rows, trend points. Keep `"sample": true` until a real certified feed exists.

Then change tab button text and the `<h2>` on each panel. Add a tab by duplicating a `data-tab` button and a `data-panel` section, then registering periods for the new id.

When they have a weekly file, write an importer that emits the **same JSON shape** (or extend it). Fail closed if required columns are missing — do not paint a blank chart as zero.

## Optional later

- Password gate and encrypted JSON: see `docs/ops/password-gate.md` in the payments repo. Do not copy hashes or keys into this kit.
- Preview vs leadership: build in a preview folder until someone says promote (`docs/ops/preview-workflow.md`).
- Plain-language errors: `js/notices.js` (`docs/ops/ui-conventions.md`).

## Do not include when sharing

- `data/raw/` or `data/processed/`
- `site/data/` or `site/preview/data/`
- Live Worldpay / POS / Olo / device numbers
- Passwords, SharePoint URLs, shop IDs, item SKUs
