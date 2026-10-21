# DB Payments (preview · private)

Weekly updates from Krishna to Ravi. The DB Payments tab needs a **second key**. The
dashboard key does not open it: the published file is encrypted with its own
password, and no password hash is shipped to the browser.

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

```json
{
  "week_start": "2026-10-19",
  "sent_on": "2026-10-23",
  "summary": "One or two sentences on what changed this week.",
  "items": [
    { "area": "Card Health", "status": "done", "text": "Published the week of Oct 12." }
  ],
  "next": ["What happens next week."],
  "asks": ["Anything Ravi needs to decide or unblock."]
}
```

`status` is `done`, `in progress`, `blocked`, or `next`. `sent_on`, `next`, and `asks`
are optional.
