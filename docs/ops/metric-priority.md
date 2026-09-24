# Leadership metric priority (In Shop · Worldpay)

Ranking used on the **preview** dashboard. Ordered by:

1. Immediate action if the metric turns critical  
2. Direct impact on revenue (or preventable margin)  
3. How actionable the metric is from Worldpay weekly files

## Scorecard order

| Rank | Metric | Why it sits here |
| --- | --- | --- |
| 1 | **Auth rate** | Industry “heartbeat.” Small approval drops are lost tickets now (Stripe / Optimized Payments guidance). |
| 2 | **Decline $** | Same problem in dollars — leadership can size the fire (~$0.4M in a sample week). |
| 3 | **Sales volume** | Confirms whether card-captured sales are moving; outcome check after auth health. |
| 4 | **Downgrade rate** | Preventable interchange leakage (often Level 2 / data quality) — margin protection, usually fixable. |
| 5 | **IC fee $** | Absolute acceptance cost this period. |
| 6 | **IC rate** | Blended cost rate (note: Amex fee is $0 in this feed). |
| 7 | **Returns as % of sales** | Refund leakage; watch spikes, rarely same-day crisis at ~0.1%. |
| 8 | **Transaction volume** | Activity companion to sales $. |
| 9 | **AOV** | Strategic ticket size — slower-moving, least “drop everything.” |

## Diagnose charts (after the scorecards)

1. **Decline reasons** — what to investigate when auth / decline $ move  
2. **Auth rate by entry method** — swipe / key-entered weakness is an ops signal  
3. **Entry / payment / wallet mix** — context and adoption, lower urgency  

## Sources informing this ranking

- Optimized Payments: auth rate + decline recovery + interchange/downgrade as C-suite proof points  
- Stripe payment KPIs: acceptance/authorization as primary revenue-leak metrics  
- Solidgate / Harmonize executive views: approval, declines, effective cost, downgrade together  

False-decline / retry and chargebacks remain **Coming soon** (need other feeds) and would rank near the top of Protect revenue once available.
