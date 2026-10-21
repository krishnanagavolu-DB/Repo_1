# E235 Roadmap (Payment Devices · preview)

The E235 Roadmap view under Payment Devices is built from a weekly JSON drop, not a
PDF. The 21 Oct 2026 roadmap PDF is the baseline:
`data/raw/e235-roadmap/e235_roadmap_20261021.json`.

## Weekly update

1. Save the new week as `data/raw/e235-roadmap/e235_roadmap_YYYYMMDD.json`
   (`YYYYMMDD` is the date of that roadmap). Copy last week's file and edit it.
2. Run:

```bash
python3 scripts/import_e235_roadmap.py
DASHBOARD_PASSWORD='…' python3 scripts/encrypt_site_data.py
```

The newest date in the filename wins. Older files stay as history.

## Fields

| Field | What it holds |
| --- | --- |
| `as_of` | Roadmap date, `YYYY-MM-DD`. Shown as "As of …". |
| `stages[]` | One per stage, in order: `id`, `name`, optional `aka`, `phase` (card label, e.g. `Current`), `column` (sequence column, e.g. `Now`), `status`, `definition`, `milestones[]`. |
| `status` | `done`, `current`, `next`, `then`, or `later`. Exactly one stage is `current`. |
| `commitments_title`, `commitments[]` | Dates and commitments for that week. |
| `assumptions[]` | Numbered on the page in the order given. |
| `open_questions[]` | Still open. Remove a line once it is answered. |

Prompt for the chat that writes the update:

> Update the E235 roadmap JSON for this week. Keep the same fields as
> `e235_roadmap_20261021.json`. Move a stage's `status` forward only when its
> sign-off happened. Keep exactly one `current` stage. Write every list entry as a
> full sentence. Name the file `e235_roadmap_YYYYMMDD.json`.
