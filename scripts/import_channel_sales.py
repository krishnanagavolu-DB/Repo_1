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
        channels = ordered_channels(buckets)
        week_problems = reconcile(week, channels)
        if week_problems:
            problems.extend(week_problems)
            continue
        week["channels"] = channels
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
