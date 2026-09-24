# Payment Devices sources

Drop the latest files here and rerun:

```
python3 scripts/import_payment_devices.py
python3 scripts/encrypt_site_data.py
```

Newest matching names win:

- `PO_Extract_[date].xlsx` — `NewCo ID`, `Projected Opening Date`
- `Daily Dutch Bros Booked Shipped Orders Report[date].xlsx` — Booked + Shipped sheets

Only item `M087-500-14-WWA` counts. A shop is fulfilled only by a booked order or a shipment on/after 1 Feb 2026. Shop ids match exactly (`AL0107`).
