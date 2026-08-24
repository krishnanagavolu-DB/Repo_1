---
name: promoting-preview
description: Use when the user says promote, publish to leadership, ship preview to the live homepage, or make leadership match preview.
---

# Promote preview to leadership

Copy the **approved preview UI** onto the leadership homepage. Do not rebuild the
page by hand. Do not overwrite leadership branding.

## When not to use

- Weekly Worldpay / POS **data** refresh — both copies already update together.
- The user has **not** said promote (or equivalent). Keep work under `site/preview/`.
- Preview still looks wrong. Fix preview first.

## Do this

1. Confirm they mean the live homepage (`site/`, Pages root), not another tweak on preview.
2. From repo root:

```bash
python3 scripts/promote_preview.py
```

3. Run the usual smokes (`node tests/*.js` used in CI, `pytest -q`).
4. Commit on a `cursor/promote-*-8ee2` branch, push, publish to `main` so Pages updates.
5. Tell them the leadership URL and to hard-refresh.

## What the script does

- Copies `site/preview/{css,js,assets}/` → `site/{css,js,assets}/`
- Rewrites preview data paths in JS to `site/data/…`
- Stamps `?v=` hashes
- **Leaves** `site/index.html` and `site/auth-config.json` and `site/data/` alone

## Hard stops

If leadership `index.html` would gain a Preview banner, a `PREVIEW ·` title, or
`Payments · Preview`, the script aborts. Do not copy `index.html` to “make them match.”

Leadership must keep:

- Title: `Dutch Bros · Payments Executive KPI Dashboard`
- Eyebrow: `Payments`
- No `.preview-banner`

Details: `docs/ops/preview-workflow.md`.
