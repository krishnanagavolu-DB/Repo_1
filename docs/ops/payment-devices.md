# Payment Devices (preview)

The **Payment Devices** tab projects remaining Verifone e285 handhelds from three drop-in files.

## Refresh

1. Put the newest files in `data/raw/payment-devices/`:
   - Vendor inventory text with `Remaining balance` and `Date`
   - `PO_Extract_[date].xlsx`
   - `Daily Dutch Bros Booked Shipped Orders Report[date].xlsx`
2. Run:

```
python3 scripts/import_payment_devices.py
python3 scripts/encrypt_site_data.py
```

The importer always picks the newest matching filenames. `NewCo ID` and `End Customer Name` are an exact 1:1 match on the 6-character shop id.

## What the chart is doing

- Unfulfilled demand = PO shops whose `NewCo ID` is not in shipped `End Customer Name`
- Each unfulfilled shop consumes 10 units on its projected opening date
- After the latest projected opening date in the PO extract, remaining units burn at 5.5 shops/week
- Horizontal lines mark 3000 / 2500 / 2000 / 1500 / 1000; 2500 is the hardware-order threshold and 1000 is the safety buffer
