# DB Payments (preview · private)

Weekly board for Ravi and Krishna: the three priorities, the six payments projects, the
side quests, wins, what is stuck, who owns each action, and the open detail. The tab needs a
**second key**. The dashboard key does not open it: the published file is encrypted with
its own password, and no password hash is shipped to the browser.

The password is set through `DB_PAYMENTS_PASSWORD` when encrypting. Do not commit it.

## Weekly update

1. Save the week as `data/raw/db-payments/db_payments_update_YYYYMMDD.json`, where
   `YYYYMMDD` is that week's Monday.
2. Run:

```bash
python3 scripts/import_db_payments.py
DASHBOARD_PASSWORD='…' DB_PAYMENTS_PASSWORD='…' python3 scripts/encrypt_site_data.py
```

Without `DB_PAYMENTS_PASSWORD`, the encrypt step leaves the DB Payments file as it
was, so a routine data refresh never re-keys it with the dashboard key.

## Update shape

| Field | Type | Notes |
| --- | --- | --- |
| `week_start` | ISO date | Must match the filename Monday. |
| `summary` | sentence | One-line read for the week. Required. |
| `top_priorities` | up to 3 sentences | Shown first. |
| `projects` | list | `name`, `status` (`In Progress`, `On Hold`, or `Closed`), `this_week`. Closed projects stay in the file but leave the board. In Progress sorts above On Hold. |
| `side_quests` | list | `name`, `status` (free text, e.g. `Done`, `In progress`), `this_week`. |
| `wins`, `stuck` | sentences | |
| `action_items` | list | `owner` is `Krishna` or `Ravi`, plus `text`. |
| `ravi_notes` | sentences | Filled from the conversation with Ravi. Empty shows a placeholder. |
| `open_detail` | sentences | Collapsed on the page. The working list, not the read-aloud. |
| `items`, `next`, `asks` | optional | Older format. Still rendered if present. |

```json
{
  "week_start": "2026-10-26",
  "summary": "One sentence.",
  "top_priorities": ["…", "…", "…"],
  "projects": [{ "name": "e235 Stop Gap Validation", "status": "In Progress", "this_week": "…" }],
  "side_quests": [{ "name": "DSP payment testing", "status": "In progress", "this_week": "…" }],
  "wins": ["…"],
  "stuck": ["…"],
  "action_items": [{ "owner": "Ravi", "text": "…" }],
  "ravi_notes": [],
  "open_detail": ["…"]
}
```
