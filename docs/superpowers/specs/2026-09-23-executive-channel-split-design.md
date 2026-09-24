# Executive Overview — Channel Split (Preview)

## Purpose

Answer one executive question on the first screen: **where does the money come
from?** Company-owned sales divide into three order channels:

1. **In shop** — the guest orders and pays at the shop (drive-thru, walk-up).
2. **Order ahead** — the guest orders and pays in the app; no payment happens
   at the shop, only pickup.
3. **Other / delivery** — third-party marketplace orders (DoorDash today).

## The correctness problem this fixes

The published POS extract filters on company-owned, `QUARANTINE = FALSE`, and
`subtype = payment`. It applies **no channel filter**. `SALES_VOLUME` is
therefore every channel, order-ahead included.

The preview currently labels that figure **In-shop sales** and places it beside
an **Order-ahead sales** card sourced from Olo/Stripe. That is wrong twice: it
overstates in-shop by roughly the order-ahead share, and it invites a reader to
add two figures where one already contains the other.

Two independent checks confirm containment:

- **Worldpay reconciliation.** Worldpay is card-present only. Against
  POS card minus Olo it lands at 1.054–1.075 (a +5% to +8% implied tip rate,
  versus Olo's published 7.4%). Against POS card alone it lands at 0.868–0.896,
  which would require a negative tip rate. Transaction counts agree: within 3%
  of POS card minus Olo, versus a 21% gap against POS card.
- **Gold exposes a `CHANNEL` dimension** whose members are Drive-Thru, Walk-Up,
  Order Ahead, and DoorDash — all on the same sales fact.

## Order Ahead the channel is not Olo Pay the processor

Olo/Stripe sees only card captures. An app order paid with Dutch Pass or a gift
card is order-ahead but never reaches Stripe. Olo therefore **understates** the
order-ahead channel and must not be used to compute channel share.

- **Channel split** comes from Gold `CHANNEL`.
- **Olo** remains the payment-health source for that channel: authorization
  rate, refunds, voids, card-brand mix.

## Data contract for the channel extract

The channel numbers must come from the extract we already run, with `CHANNEL`
added to the grouping. Any other measure is rejected.

| Requirement | Value |
| --- | --- |
| Fact | `GOLD_SEMANTIC.SALES.VW_FACT_ORDER_PAYMENT` |
| Measure | existing `SALES_VOLUME` (payment dollars, tips and change excluded) |
| Scope | Company Owned via `VW_DIM_STORE_CURATED.OWNERSHIP` |
| Filters | `QUARANTINE = FALSE`, `subtype = payment` |
| Grain | completed Monday–Sunday weeks |
| Added | `CHANNEL`, plus `ORDER_COUNT` per channel |

`NET_SALES` from the Snowflake agent screenshot is **not** this measure. That
panel was system-wide (all open stores) yet its daily total ($5.81M) fell below
our company-owned daily average ($6.43M), and its per-ticket value was $8.29
against our $10.72 — about 23% lower. Different scope, different measure.

### Channel mapping

| Gold `CHANNEL` | Dashboard channel |
| --- | --- |
| Drive-Thru, Walk-Up | In shop |
| Order Ahead | Order ahead |
| DoorDash, other marketplace | Other / delivery |

Unrecognized channel values roll into **Other / delivery** and are named in the
methodology rather than silently dropped.

### The reconciliation rule

In shop + Order ahead + Other must equal the published `SALES_VOLUME` for the
week, to the cent, and the same for order counts. CI fails the publish when it
does not. A channel split that disagrees with the headline total is worse than
no split at all.

## Executive Overview changes

### KPI row — five cards

| Card | Source label |
| --- | --- |
| Total sales | POS · ex-tip |
| Total orders | POS · guest checks |
| Avg ticket | POS · ex-tip |
| Card auth rate | Worldpay · card present |
| Order-ahead auth rate | Stripe · order ahead |

"In-shop sales / orders / avg ticket" become "Total …" because that is what the
figures are. The Olo **sales** and **orders** cards leave the overview: with the
band carrying channel dollars and orders, keeping them would show two different
"order ahead" numbers on one slide. Olo detail stays on the Order Ahead tab.

### Channel band

A full-width band sits directly under the KPI row, above the two charts.

- Title **Where the money came from**; right side shows total sales and orders.
- A 100% stacked bar, one segment per channel, percentage inside the segment
  when it fits.
- A key line per channel: dollars, orders, average ticket.
- Colors reuse the slide's existing assignments — In shop `#006098`, Order ahead
  `#154167` (the same blue and navy as the sales-trend lines), Other `#4094A7`
  from the established mix palette. Brand yellow is not used: it is already the
  tender doughnut's Gift Card color and fails contrast at this size.
- A segment under ~2% keeps a minimum rendered width so it stays visible, with
  its true percentage in the key. The bar is proportional, not scaled to
  flatter a small channel.

### Until the extract lands

The band renders a **Coming next** state in the style of the Order Ahead
placeholders, naming the field it waits on. The preview never estimates channel
share from Olo, and never shows a partial split as if it were complete.

### Other copy corrections

- Tender doughnut title: "How guests paid in shop" → **How guests paid**.
- Reconciliation note states that total sales cover every channel and that Olo
  is the processor for order-ahead card payments, not the channel total.

## Architecture

`site/preview/js/executive-overview.js` gains:

- `normalizeChannelWeeks(payload)` — reads the channel block when present.
- `buildChannelSplit(posWeek, channelWeek)` — returns ordered segments with
  dollars, orders, ticket, and share, or `null` when uncertified.
- `renderChannelBand(model)` — renders the band or the coming-next state.

`buildChannelSplit` returns `null` rather than a partial split when segments do
not reconcile to the POS total. Pure helpers stay exported for tests.

Markup goes in `site/preview/index.html`; styles in
`site/preview/css/dashboard.css`. Leadership `site/` is untouched.

## Testing

Extend `tests/executive_overview_smoke.js`:

- Overview exposes exactly five KPI cards with the corrected labels.
- No KPI is labeled "In-shop sales".
- `orderAheadSales` and `orderAheadOrders` are absent from the overview model.
- `buildChannelSplit` returns segments summing to the POS total and to 100%.
- `buildChannelSplit` returns `null` when segments miss the total by over a cent.
- `buildChannelSplit` returns `null` when no channel data exists.
- The band renders the coming-next state when the split is `null`, and never
  prints a percentage in that state.
- Rendered band markup reconciles to the published total.

## Acceptance criteria

- The overview states a channel split or says it is coming — never a guess.
- Channel segments reconcile exactly to published `SALES_VOLUME` and orders.
- No visible label calls an all-channel figure "in-shop".
- One definition of "order ahead" per slide.
- The slide still fits one 1440×900 viewport.
- Leadership `site/` files unchanged; all CI checks pass.
