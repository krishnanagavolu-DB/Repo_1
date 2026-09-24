#!/usr/bin/env python3
"""Load the Gold CHANNEL breakdown into the certified POS weeks.

The executive band splits sales into In shop, Order ahead, and Other /
delivery. Those numbers must come from the same extract, measure, and scope as
the published total, so this importer refuses any week whose channel rows do
not add back to the certified SALES_VOLUME and ORDER_COUNT.

Input is whatever the Snowflake channel query returns: a JSON array, a JSON
object with a `rows` list, or a CSV with a header row. Required fields per row
are the week start date, the channel name, sales dollars, and order count.

Usage:
    python3 scripts/import_channel_sales.py data/raw/pos-sales/channel_sales_20260921.json
    python3 scripts/import_channel_sales.py --check
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PROCESSED = ROOT / "data" / "processed" / "in_shop_sales_data.json"

# Gold channel members map onto the three channels leadership asked for. In
# shop is "paid at the shop"; order ahead is paid in the app before pickup.
IN_SHOP = {"drive-thru", "drive thru", "drivethru", "walk-up", "walk up", "walkup", "in shop"}
ORDER_AHEAD = {"order ahead", "order-ahead", "orderahead", "mobile order"}

IN_SHOP_LABEL = "In shop"
ORDER_AHEAD_LABEL = "Order ahead"
OTHER_LABEL = "Other / delivery"
CHANNEL_ORDER = (IN_SHOP_LABEL, ORDER_AHEAD_LABEL, OTHER_LABEL)

WEEK_KEYS = ("week_start_date", "WEEK_START_DATE", "week_start", "WEEK_START", "week")
CHANNEL_KEYS = ("channel", "CHANNEL", "channel_name", "CHANNEL_NAME")
SALES_KEYS = ("sales", "SALES_VOLUME", "sales_volume", "net_sales", "NET_SALES", "amount")
ORDER_KEYS = ("orders", "ORDER_COUNT", "order_count", "transactions", "TRANSACTIONS")

SALES_TOLERANCE = 0.01
ORDER_TOLERANCE = 1

# A channel query run days after the POS extract picks up transactions that
# settled in between, so a week can land a few dollars above its published
# total. Drift under this share of the week is scaled back onto the segments
# and recorded; anything larger means the query disagrees with the published
# figure for a real reason and is refused. A missing channel would be orders
# of magnitude past this: DoorDash alone would be ~0.08% of a week.
DRIFT_RATIO = 0.00002  # 0.002%


def _first(row: dict, keys: tuple[str, ...]):
    for key in keys:
        if key in row and row[key] not in (None, ""):
            return row[key]
    return None


def _number(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace(",", "").replace("$", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def bucket_for(channel: str) -> str:
    """Unrecognized channels roll into Other / delivery rather than vanishing."""
    key = str(channel or "").strip().lower()
    if key in IN_SHOP:
        return IN_SHOP_LABEL
    if key in ORDER_AHEAD:
        return ORDER_AHEAD_LABEL
    return OTHER_LABEL


def read_rows(path: Path) -> list[dict]:
    text = path.read_text(encoding="utf-8").strip()
    if not text:
        raise ValueError(f"{path.name}: file is empty")
    if text[0] in "[{":
        payload = json.loads(text)
        if isinstance(payload, dict):
            for key in ("rows", "data", "results", "channels"):
                if isinstance(payload.get(key), list):
                    return payload[key]
            raise ValueError(f"{path.name}: no row list found in JSON object")
        if isinstance(payload, list):
            return payload
        raise ValueError(f"{path.name}: unsupported JSON shape")
    return list(csv.DictReader(io.StringIO(text)))


def group_rows(rows: list[dict]) -> dict[str, dict[str, dict]]:
    """Collapse raw channel rows into {week: {bucket: {sales, orders}}}."""
    grouped: dict[str, dict[str, dict]] = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("channel rows must be objects")
        week = _first(row, WEEK_KEYS)
        channel = _first(row, CHANNEL_KEYS)
        sales = _number(_first(row, SALES_KEYS))
        orders = _number(_first(row, ORDER_KEYS))
        if week is None or channel is None:
            raise ValueError(f"row missing week or channel: {row}")
        if sales is None:
            raise ValueError(f"row missing sales for {channel} in {week}")
        week_key = str(week).strip()[:10]
        bucket = grouped.setdefault(week_key, {})
        entry = bucket.setdefault(bucket_for(channel), {"sales": 0.0, "orders": 0.0})
        entry["sales"] += sales
        entry["orders"] += orders or 0.0
    return grouped


def reconcile(week: dict, channels: list[dict]) -> list[str]:
    """A split that disagrees with the published total must never publish."""
    problems = []
    totals = week.get("totals") or {}
    total_sales = _number(totals.get("SALES_VOLUME"))
    total_orders = _number(totals.get("ORDER_COUNT"))
    start = week.get("week_start_date")

    sales_sum = round(sum(row["sales"] for row in channels), 2)
    if total_sales is None:
        problems.append(f"{start}: published week has no SALES_VOLUME to reconcile against")
    elif abs(sales_sum - total_sales) > SALES_TOLERANCE:
        problems.append(
            f"{start}: channel sales {sales_sum:,.2f} != published {total_sales:,.2f} "
            f"(off by {sales_sum - total_sales:,.2f})"
        )

    order_sum = sum(row.get("orders") or 0 for row in channels)
    if total_orders is not None and order_sum:
        if abs(order_sum - total_orders) > ORDER_TOLERANCE:
            problems.append(
                f"{start}: channel orders {order_sum:,.0f} != published {total_orders:,.0f}"
            )
    return problems


def settle_drift(week: dict, channels: list[dict]) -> tuple[list[dict], dict | None, list[str]]:
    """Scale small settlement drift onto the segments so the split ties out.

    Returns the channels to publish, an audit record when an adjustment was
    applied, and any problems that make the week unpublishable.
    """
    totals = week.get("totals") or {}
    total_sales = _number(totals.get("SALES_VOLUME"))
    total_orders = _number(totals.get("ORDER_COUNT"))
    start = week.get("week_start_date")
    if total_sales is None or total_sales <= 0:
        return channels, None, [f"{start}: published week has no SALES_VOLUME to reconcile against"]

    sales_sum = round(sum(row["sales"] for row in channels), 2)
    order_sum = sum(row.get("orders") or 0 for row in channels)
    sales_drift = sales_sum - total_sales
    order_drift = order_sum - total_orders if total_orders else 0

    if abs(sales_drift) <= SALES_TOLERANCE and abs(order_drift) <= ORDER_TOLERANCE:
        return channels, None, []

    limit = total_sales * DRIFT_RATIO
    order_limit = max(ORDER_TOLERANCE, (total_orders or 0) * DRIFT_RATIO)
    if abs(sales_drift) > limit or abs(order_drift) > order_limit:
        return (
            channels,
            None,
            [
                f"{start}: channel totals differ from published by "
                f"{sales_drift:,.2f} and {order_drift:,.0f} orders, beyond settlement drift "
                f"(limit {limit:,.2f} / {order_limit:,.0f})"
            ],
        )

    scale = total_sales / sales_sum
    adjusted = [{**row, "sales": round(row["sales"] * scale, 2)} for row in channels]
    # Rounding leaves at most a cent; put it on the largest segment.
    residual = round(total_sales - sum(row["sales"] for row in adjusted), 2)
    if residual:
        biggest = max(range(len(adjusted)), key=lambda i: adjusted[i]["sales"])
        adjusted[biggest]["sales"] = round(adjusted[biggest]["sales"] + residual, 2)

    if total_orders and order_sum:
        order_scale = total_orders / order_sum
        for row in adjusted:
            row["orders"] = int(round((row.get("orders") or 0) * order_scale))
        order_residual = int(total_orders - sum(row["orders"] for row in adjusted))
        if order_residual:
            biggest = max(range(len(adjusted)), key=lambda i: adjusted[i]["orders"])
            adjusted[biggest]["orders"] += order_residual

    return (
        adjusted,
        {
            "reason": "settlement drift between the POS extract and the channel query",
            "sales_drift": round(sales_drift, 2),
            "order_drift": int(order_drift),
        },
        [],
    )


def ordered_channels(buckets: dict[str, dict]) -> list[dict]:
    rows = []
    for label in CHANNEL_ORDER:
        entry = buckets.get(label)
        if not entry:
            continue
        rows.append(
            {
                "label": label,
                "sales": round(entry["sales"], 2),
                "orders": int(round(entry["orders"])) if entry["orders"] else 0,
            }
        )
    return rows


def apply_channels(payload: dict, grouped: dict[str, dict[str, dict]]) -> tuple[int, list[str]]:
    problems: list[str] = []
    applied = 0
    matched_weeks = set()
    for week in payload.get("weeks", []):
        start = str(week.get("week_start_date") or "")
        buckets = grouped.get(start)
        if not buckets:
            continue
        matched_weeks.add(start)
        channels, adjustment, drift_problems = settle_drift(week, ordered_channels(buckets))
        if drift_problems:
            problems.extend(drift_problems)
            continue
        week_problems = reconcile(week, channels)
        if week_problems:
            problems.extend(week_problems)
            continue
        week["channels"] = channels
        if adjustment:
            week["channel_reconciliation"] = adjustment
        else:
            week.pop("channel_reconciliation", None)
        applied += 1

    unknown = sorted(set(grouped) - matched_weeks)
    if unknown:
        problems.append(
            "channel rows reference weeks that are not published: " + ", ".join(unknown)
        )
    return applied, problems


def check_published(payload: dict) -> list[str]:
    problems = []
    for week in payload.get("weeks", []):
        channels = week.get("channels")
        if not channels:
            continue
        rows = [
            {"sales": _number(row.get("sales")) or 0.0, "orders": _number(row.get("orders")) or 0}
            for row in channels
        ]
        problems.extend(reconcile(week, rows))
    return problems


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", nargs="*", type=Path, help="channel query output (JSON or CSV)")
    parser.add_argument(
        "--processed", type=Path, default=PROCESSED, help="certified POS JSON to update"
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify channel rows already published reconcile to their week totals",
    )
    args = parser.parse_args(argv)

    payload = json.loads(args.processed.read_text(encoding="utf-8"))

    if args.check:
        problems = check_published(payload)
        if problems:
            print("Published channel rows do not reconcile:", file=sys.stderr)
            for item in problems:
                print(f"  {item}", file=sys.stderr)
            return 1
        weeks = sum(1 for w in payload.get("weeks", []) if w.get("channels"))
        print(f"Channel rows reconcile to published totals ({weeks} week(s) carry channels).")
        return 0

    if not args.sources:
        print("Pass at least one channel export, or use --check.", file=sys.stderr)
        return 1

    rows: list[dict] = []
    for path in args.sources:
        rows.extend(read_rows(path))
    if not rows:
        print("No channel rows found in the given files.", file=sys.stderr)
        return 1

    grouped = group_rows(rows)
    applied, problems = apply_channels(payload, grouped)

    if problems:
        print("Channel import refused; nothing was written:", file=sys.stderr)
        for item in problems:
            print(f"  {item}", file=sys.stderr)
        return 1

    if not applied:
        print("No published week matched the channel rows.", file=sys.stderr)
        return 1

    args.processed.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    try:
        shown = args.processed.relative_to(ROOT)
    except ValueError:
        shown = args.processed
    print(f"Applied channel split to {applied} week(s) in {shown}")
    print("Now run: DASHBOARD_PASSWORD='…' python3 scripts/encrypt_site_data.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
