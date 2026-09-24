# Payment Devices (preview)

The **Payment Devices** tab projects remaining Verifone e285 handhelds from a **5,700-unit contract baseline on 1 Feb 2026**.

Live firm balance is always:

`5,700 − shipped qty since Feb 2026 − booked qty` from the orders workbook (item `M087-500-14-WWA` only). Vendor email totals are never used to override that.

## Refresh

1. Put the newest files in `data/raw/payment-devices/`:
   - `PO_Extract_[date].xlsx` (`NewCo ID`, `Projected Opening Date`)
   - `Daily Dutch Bros Booked Shipped Orders Report[date].xlsx` (`End Customer Name`, `Item Number`, `Ordered Qty` / `Shipped Qty`, `Requested Date`, `Shipping Date`)
2. Run:

```
python3 scripts/import_payment_devices.py
DASHBOARD_PASSWORD='…' python3 scripts/encrypt_site_data.py
```

Parsed JSON with the same names is also accepted. The importer always uses the newest matching filenames.

- Scope: total ecosystem hardware depletion (company-owned and franchise/Boersma) against the 5,700-unit master contract. Do not filter by billing entity.

- Only item **M087-500-14-WWA** counts. Accessories/kits are ignored.
- `NewCo ID` and `End Customer Name` are an exact 1:1 match on the 6-character shop id.
- If a shop is on **Shipped Orders**, use `Shipped Qty` on `Shipping Date` and ignore booked rows for that shop.
- If a shop is **booked only**, use `Ordered Qty` on `Requested Date`.
- Pending demand is PO shops that are in neither booked nor shipped.

## Chart

- Solid black: firm booked/shipped burn from 5,700, stopping at today or the last formally booked order.
- Dashed red: starts at that firm ending balance, burns 10 units per pending shop on projected opening minus 14 days, then 5.5 shops/week after the latest PO date.
- Thresholds at 3000 / 2500 / 2000 / 1500 / 1000; 2500 is the e235 order trigger and 1000 is the safety buffer.
