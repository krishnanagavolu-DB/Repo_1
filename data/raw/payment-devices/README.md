# Payment Devices sources

Drop the latest files here and rerun:

```
python3 scripts/import_payment_devices.py
python3 scripts/encrypt_site_data.py
```

The importer always uses the newest matching names:

- Vendor inventory text (`*vendor*`, `*inventory*`, or `*kimlie*.txt`) with `Remaining balance` and `Date`
- `PO_Extract_[date].xlsx` — `NewCo ID` and `Projected Opening Date`
- `Daily Dutch Bros Booked Shipped Orders Report[date].xlsx` — `End Customer Name` on **Booked Orders** and **Shipped Orders** (headers may start on row 2)

`NewCo ID` and `End Customer Name` are an exact 1:1 match on the 6-character shop id (`AL0107`).
