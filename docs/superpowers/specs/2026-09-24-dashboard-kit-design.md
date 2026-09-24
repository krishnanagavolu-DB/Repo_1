# Dutch Bros dashboard kit — shareable template

**Date:** 2026-09-24  
**Status:** Approved to build  
**Audience:** Other Dutch Bros teams who want the same executive dashboard look without copying payments datasets

## Goal

Give another team two files they can hand around:

1. A **Markdown playbook** (`docs/dashboard-kit/README.md`) that explains the shell, tabs, KPI cards, pies, bars, and line charts.
2. A **Cursor skill** (`.cursor/skills/building-dutch-bros-dashboard/SKILL.md`) that tells an agent to copy that shell and theme, then swap in the team’s own metrics.

A working **starter page** with invented numbers lives next to the playbook so they can see tabs and charts before they have a feed. GitLab Pages hosting is a separate skill (`hosting-gitlab-pages`) plus `docs/dashboard-kit/GITLAB.md`.

## Locked decisions

| Topic | Decision |
|---|---|
| Brand | Keep Dutch Bros Visual Identity tokens, Futura PT (Typekit), and the logo SVG |
| Data | Do not ship Worldpay, POS, Olo, or device extracts. Sample JSON is labeled fiction |
| Stack | Static HTML + CSS + Chart.js 4.4.1, same as preview |
| Hosting | Out of scope for the kit. Teams keep their own Pages / internal host |
| Password gate | Documented as optional; starter stays unlocked so it runs from a folder |

## What to copy vs invent

**Copy (do not restyle from scratch):** `dashboard.css`, `dutchbros-logo.svg`, Typekit links, `tabs.js`, `chart-labels.js`, `notices.js`, Chart.js from the CDN.

**Replace:** tab names, KPI labels, chart titles, and the JSON (or importer) that fills them.

**Never copy:** `data/raw/`, `data/processed/`, `site/**/data/*.json`, passwords, shop IDs, item SKUs.

## Starter shape

One page, two tabs (example: “Scorecard” and “Mix”). Period dropdown with sample weeks. Hero KPI row, doughnut + legend, horizontal bars, line trend. `tabs.js` registers periods; Chart.js uses `inlineValueLabels` so exported slides show values without hover.

## Success

A teammate can clone the kit folder, open `starter/index.html` locally, and then rename tabs and edit `sample.json` without touching payments pipelines.
