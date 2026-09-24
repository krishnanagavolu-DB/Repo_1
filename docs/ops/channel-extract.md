# Channel extract — what the executive band needs

The Executive Overview band splits sales into **In shop**, **Order ahead**, and
**Other / delivery**. It stays in its "Coming next" state until the certified
POS weeks carry channel rows.

## The measure must match the published total

Ask for the channel breakdown of the number we already publish. Do **not** use
`NET_SALES` from the Snowflake agent panel: that panel was system-wide (all open
stores) and ran about 23% lower per ticket than our company-owned payment
dollars. Different scope, different measure.

| Requirement | Value |
| --- | --- |
| Fact | `GOLD_SEMANTIC.SALES.VW_FACT_ORDER_PAYMENT` |
| Measure | `SALES_VOLUME` — payment dollars, tips and change excluded |
| Orders | distinct `ORDER_ID` |
| Scope | Company Owned via `VW_DIM_STORE_CURATED.OWNERSHIP` |
| Filters | `QUARANTINE = FALSE`, subtype `payment` |
| Grain | completed Monday–Sunday weeks, one row per week per channel |

## Asking the Snowflake agent

> For company-owned shops only, give me weekly Monday–Sunday totals **by
> channel** for the last 12 completed weeks. Use the same measure as
> `GOLD_SEMANTIC.SALES.VW_FACT_ORDER_PAYMENT` payment dollars with
> `QUARANTINE = FALSE` and payment subtype, tips and change excluded — not
> `NET_SALES`. Return columns exactly:
> `WEEK_START_DATE, CHANNEL, SALES_VOLUME, ORDER_COUNT`
> where `ORDER_COUNT` is distinct `ORDER_ID`. Export as CSV.

The weekly totals it returns must add back to the `SALES_VOLUME` already in
`data/processed/in_shop_sales_data.json`. The importer enforces that.

## Loading the result

```bash
python3 scripts/import_channel_sales.py data/raw/pos-sales/channel_sales_YYYYMMDD.csv
DASHBOARD_PASSWORD='…' python3 scripts/encrypt_site_data.py
python3 scripts/import_channel_sales.py --check
```

The importer accepts CSV or JSON, folds Drive-Thru and Walk-Up into **In shop**,
maps Order Ahead to **Order ahead**, and rolls every other channel (DoorDash and
any future marketplace) into **Other / delivery**.

It refuses the whole import — writing nothing — when a week's channel rows miss
the published `SALES_VOLUME` by more than a cent or the order count by more than
one. A split that disagrees with the headline number would be worse than no
split, so the band keeps saying "Coming next" instead.

`--check` re-validates whatever is already published and runs in CI, so channel
rows cannot drift away from their week totals later.

## Why Olo cannot supply this

Olo/Stripe sees card captures only. An app order paid with Dutch Pass or a gift
card is order-ahead but never reaches Stripe, so Olo understates the channel.
Olo stays the payment-health source for order ahead — authorization rate,
refunds, voids, card brand — not the channel total.
