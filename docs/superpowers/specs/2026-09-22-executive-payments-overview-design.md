# Executive Payments Overview — Preview Design

## Purpose

Turn the preview dashboard into a screenshot-ready executive decision surface
without changing the leadership page. The first screen must answer:

1. How much did company-owned shops sell?
2. How are guests paying?
3. Are card and order-ahead payments healthy?
4. What changed enough to deserve attention?
5. Where is the data incomplete or not comparable?

The dashboard must remain factual. It may derive arithmetic from certified
published data, but it must not invent targets, causes, store rankings, regions,
prior-year comparisons, or alerts requiring unavailable source fields.

## Audience and output

The primary audience is Dutch Bros executive leadership. The default view is
designed as one 16:9-style slide that can be captured and placed directly into a
PowerPoint. Supporting detail remains available below the slide and on the
channel tabs.

## Information architecture

The preview navigation becomes:

1. **Executive Overview** — default tab and cross-channel leadership slide.
2. **In-Shop Sales** — Gold Semantic/Xenial POS sales and tender mix.
3. **Card Health** — Worldpay card-present authorizations, declines, wallets,
   entry method, and interchange cost.
4. **Order Ahead** — Olo Pay/Stripe sales, orders, authorization health, and
   card-brand mix.
5. Existing disabled future tabs remain after the active tabs.

The old labels “All payments,” “Card present,” and “Olo Pay” remain in
methodology where technically relevant, but are no longer the primary
navigation labels.

## Executive Overview slide

### Header

The slide title is **Payments Executive Overview**. Its period label uses the
selected completed Monday–Sunday week. A small scope line says
**Company-owned shops · completed weeks**.

### KPI row

The top row contains six compact cards:

- **In-shop sales** — POS `SALES_VOLUME`, ex-tip.
- **In-shop orders** — POS `ORDER_COUNT`.
- **In-shop avg ticket** — POS `AVG_TICKET`, ex-tip.
- **Card auth rate** — Worldpay `auth_rate`.
- **Order-ahead sales** — Olo `SALES_VOLUME`, ex-tip.
- **Order-ahead auth rate** — Olo authorization rate.

Each card shows the current value and a week-over-week comparison only when the
same source has an adjacent prior week. The labels state the source/grain in
short form so POS sales and processor-authorized dollars are not confused.

The overview never adds POS, Worldpay, and Olo sales together. POS and Worldpay
overlap, while Olo represents a different channel.

### Trend and mix row

Two panels occupy the middle:

- **Sales trend** — in-shop POS sales and order-ahead Olo sales as separate
  lines, using up to 12 available completed weeks. Worldpay dollars are excluded
  because they overlap POS card sales and include tips.
- **How guests paid in shop** — POS Card, Cash, and Gift Card / Dutch Pass mix
  for the selected week.

Charts use existing colors, typography, chart-label helpers, and restrained
legends. The slide shows no more than two charts.

### Watchlist row

The bottom row contains a maximum of three short, ranked observations generated
from published facts:

1. Largest absolute week-over-week movement among overview KPIs.
2. Card authorization-rate movement.
3. Data coverage or comparability notice when relevant.

Each observation contains the metric, direction, magnitude, and compared weeks.
It does not claim a cause. Tone is neutral:

> In-shop sales decreased 4.7% versus the prior completed week.

If no adjacent prior week exists, the item says comparison is unavailable.
Red is reserved for material negative movement already represented in the data;
yellow indicates “watch”; blue indicates context. These are observations, not
policy thresholds.

### Reconciliation note

A one-line footnote states:

> POS sales are ex-tip. Worldpay card dollars include tip and overlap POS card
> sales. Olo Pay is order-ahead and is not added to Worldpay.

This note is always visible on the overview.

## Period behavior

The period selector becomes tab-aware:

- Executive Overview: dates present in POS, Worldpay, and Olo simultaneously.
- In-Shop Sales: POS dates only.
- Card Health: Worldpay dates only.
- Order Ahead: Olo dates only.

Switching tabs preserves the selected date if available. Otherwise it selects
the latest available date for that tab. An executive should not land on an
empty panel merely because another source has a longer history.

The selector also offers an **Available history** option per tab. It replaces
the misleading “YTD” label because none of the sources begins on January 1.
History cards and banners state their actual start date and week count.

## Existing channel slides

The existing visual style and layouts remain, with focused copy changes:

- **All payments · Sales & tender mix** → **In-Shop Sales · Tender mix**
- **Card present · Approval & cost** → **Card Health · Approval & cost**
- **OLO PAY · DIGITAL APPROVAL & SALES** →
  **ORDER AHEAD · OLO PAY & STRIPE**
- “YTD” copy becomes **Available history** with explicit date coverage.

Detailed tables and secondary charts stay folded under **More detail**.

## Empty, incomplete, and unavailable states

Tab-aware periods should prevent normal empty states. If data loading fails or
a source has no certified weeks:

- The affected KPI card displays **Not available** rather than zero.
- The overview remains usable with the available sources.
- A watchlist item names the missing source.
- The page never fabricates a replacement value.

The dashboard will not add store, region, same-store, target, YoY, chargeback,
latency, or false-decline cards until those fields are certified in source data.

## Architecture

Create `site/preview/js/executive-overview.js` as a focused module. It:

- Loads the three existing preview JSON files.
- Normalizes them through the existing exported POS/Olo helpers and a small
  Worldpay adapter.
- Exposes pure helpers for intersecting periods, building KPI cards, trends,
  and watchlist observations.
- Renders only the overview panel and publishes its available periods to the
  tab controller.

Extend `tabs.js` to coordinate active-tab period availability. Existing channel
renderers continue to own their own panels.

Add overview markup to `site/preview/index.html` and component styles to
`site/preview/css/dashboard.css`. Leadership files under `site/` are not
modified.

## Testing

Add `tests/executive_overview_smoke.js` before implementation. It verifies:

- Overview is the default active tab.
- New navigation labels and overview landmarks exist.
- Period intersection includes only dates available in all three sources.
- Tab-aware fallback selects the latest valid date.
- KPI calculations use the correct sources and never sum overlapping sales.
- Watchlist language reports movement without claiming causes.
- Available-history copy does not use “YTD.”
- The reconciliation note is visible.
- The overview remains valid when one source is unavailable.

Update existing layout, chatbot, asset-stamp, and tab tests to use the new
labels while retaining technical definitions.

Run the full local publish command:

```bash
scripts/run_ci_checks.sh
```

## Acceptance criteria

- `/preview/` opens on a complete, screenshot-ready Executive Overview.
- The overview fits in one desktop viewport at 1440×900 without Ask Data.
- No more than six KPI cards, two charts, and three watchlist items appear.
- Each tab only offers periods it can render.
- “YTD” is absent from visible dashboard coverage language.
- POS, Worldpay, and Olo values are never added as if they were non-overlapping.
- Existing preview channel details and Ask Data still work.
- Leadership `site/index.html`, CSS, JS, and assets remain unchanged.
- All automated checks pass.
