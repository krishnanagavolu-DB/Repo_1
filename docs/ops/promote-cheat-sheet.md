# Payments dashboard — how we publish (save this)

A one-page note for you. You can copy this file into Notes, SharePoint, or a local folder. You do not need to remember repo paths.

---

## Two pages, one product

| Who it’s for | Link | What it is |
|---|---|---|
| **You / experiments** | https://krishnanagavolu-db.github.io/Repo_1/preview/ | Safe sandbox. Labeled **Preview**. Try look, chat, and layout here first. |
| **Leadership** | https://krishnanagavolu-db.github.io/Repo_1/ | Official scorecard. Same URL every week. Do not send people the preview link. |

Hard-refresh (Cmd+Shift+R or Ctrl+Shift+R) if a page looks stale after a publish.

---

## The word that ships the look

When preview looks right, say this in Cursor chat:

**promote**  
(also fine: **publish to leadership** / **make leadership match preview**)

That is the handoff. The agent should **not** rebuild the page from scratch.

It runs one command:

```bash
python3 scripts/promote_preview.py
```

Then it checks tests and publishes so GitHub Pages can refresh the leadership URL.

### What “promote” copies
Look, charts, colors, type, chatbot behavior — the **preview UI**.

### What “promote” never overwrites
- The leadership title (**Dutch Bros · Payments Executive KPI Dashboard**)
- The **Payments** label (not “Payments · Preview”)
- The yellow **Preview only** banner (leadership must not get that)
- Password / lock settings
- The weekly **numbers** files (those already update on both pages together)

If something would paste the Preview banner onto the live homepage, the script **stops**. That is on purpose.

---

## Weekly numbers (not “promote”)

New Worldpay Excels or a new `in_shop_sales_data_YYYYMMDD.json` are a **data refresh**, not a promote.

- Drop / import → certify → both pages get the same JSON.
- Do **not** rewrite ingest or dashboard code for a normal week.
- If certification **errors**, leave the live site as-is and report the failure.
- A **warning** (odd spike) can still publish, but the movement should be explained — not quietly “fixed.”

SharePoint drop folder (Worldpay only):

`CoreShopTech` → Shared Documents → General → Payment Systems → Reports → Worldpay → **WP Weekly Reports**

---

## How to talk to the agent (saves time)

| You want | Say |
|---|---|
| Try a look or chat change | Describe it; it should land on **preview** first |
| Make the official page match preview | **promote** |
| Load this week’s Worldpay files | “Ingest this week’s Auth + Interchange” (attach the two Excels) |
| Load All payments JSON | “Import this in-shop sales file” (the dated JSON is enough) |
| Skip extra questions | **just do it** |
| Challenge the idea first | That’s the default (grill). You already asked for that. |

You do **not** need to mention folders, Git, or PRs unless something is stuck.

---

## What never goes on the live page

- “Preview” in the title or a preview banner
- Callouts about shops that were left out of the company-owned footprint (the quiet line “Company owned shops only” is enough)
- Raw error codes as the headline (plain language first)

Official brand colors if we ever restyle again:

- Blue `#006098`
- Yellow `#F6E300`
- Red `#D9272D`
- Navy `#154167`
- Page fill `#E8EEF2`
- Type: **Futura PT** (Heavy on titles, Book on body)

---

## If a future chat “forgets”

Paste this file into the chat, or point at:

- This note: `docs/ops/promote-cheat-sheet.md` (in the GitHub repo)
- Agent skill: `.cursor/skills/promoting-preview/SKILL.md`
- Command: `python3 scripts/promote_preview.py`

Repo: https://github.com/krishnanagavolu-DB/Repo_1
