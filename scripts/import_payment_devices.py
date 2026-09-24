#!/usr/bin/env python3
"""Build the Verifone e285 lifecycle burndown from dropped-in source files.

Drop the latest PO extract and orders report into `data/raw/payment-devices/`
and rerun. The importer always picks the newest matching files.

Usage:
    python3 scripts/import_payment_devices.py
    python3 scripts/import_payment_devices.py --raw data/raw/payment-devices --as-of 2026-04-01
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "payment-devices"
PROCESSED = ROOT / "data" / "processed" / "payment_devices.json"

TARGET_ITEM = "M087-500-14-WWA"
BASELINE_INVENTORY = 5700
BASELINE_DATE = date(2026, 2, 1)
DEVICES_PER_SHOP = 10
SHOPS_PER_WEEK = 5.5
DEVICES_PER_WEEK = DEVICES_PER_SHOP * SHOPS_PER_WEEK
DEVICES_PER_DAY = DEVICES_PER_WEEK / 7
STAGING_LEAD_DAYS = 14
THRESHOLDS = (3000, 2500, 2000, 1500, 1000)
SAFETY_BUFFER = 1000
ORDER_THRESHOLD = 2500
CHART_END = date(2028, 6, 30)

PO_NAME = re.compile(r"PO_Extract_.*\.(xlsx|json)$", re.I)
ORDERS_NAME = re.compile(r"Daily Dutch Bros Booked Shipped Orders Report.*\.(xlsx|json)$", re.I)
ISO_IN_NAME = re.compile(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})")
NEWCO_RE = re.compile(r"^[A-Za-z]{2}\d{4}$")

PO_ID_HEADERS = ("newco id", "newcoid", "newco_id", "shop id", "shop_id")
PO_DATE_HEADERS = (
    "projected opening date",
    "projected_opening_date",
    "opening date",
    "open date",
)
CUSTOMER_HEADERS = ("end customer name", "end_customer_name", "end customer", "shop id")
ITEM_HEADERS = ("item number", "item", "item no", "item #", "item_number")
ORDERED_QTY_HEADERS = ("ordered qty", "order qty", "qty ordered", "ordered_qty", "qty")
SHIPPED_QTY_HEADERS = ("shipped qty", "qty shipped", "ship qty", "shipped_qty", "qty")
REQUESTED_HEADERS = ("requested date", "approx. ship date", "approx ship date", "requested_date")
SHIPPING_HEADERS = ("shipping date", "ship date", "shipped date", "shipping_date")


def json_ready(value):
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, dict):
        return {key: json_ready(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_ready(item) for item in value]
    if isinstance(value, float):
        return round(value, 4)
    return value


def parse_date(value) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y%m%d"):
        try:
            return datetime.strptime(text[:10] if fmt != "%Y%m%d" else text[:8], fmt).date()
        except ValueError:
            continue
    return None


def parse_qty(value) -> int:
    if value is None or value == "":
        return 0
    try:
        return int(round(float(str(value).replace(",", ""))))
    except ValueError:
        return 0


def cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def normalize_shop_id(value) -> str:
    return cell_text(value)


def is_target_item(value) -> bool:
    return cell_text(value).upper() == TARGET_ITEM


def latest_file(directory: Path, pattern: re.Pattern[str]) -> Path | None:
    matches = [path for path in directory.glob("*") if path.is_file() and pattern.search(path.name)]
    if not matches:
        return None

    def sort_key(path: Path) -> tuple:
        found = ISO_IN_NAME.search(path.name)
        stamp = date.min
        if found:
            stamp = date(int(found.group(1)), int(found.group(2)), int(found.group(3)))
        return (stamp, path.stat().st_mtime)

    return max(matches, key=sort_key)


def _header_index(row: list[str], aliases: tuple[str, ...]) -> int | None:
    lowered = [cell_text(value).lower() for value in row]
    for alias in aliases:
        if alias in lowered:
            return lowered.index(alias)
    return None


def _detect_header_row(rows: list[tuple], aliases: tuple[str, ...], scan: int = 15) -> tuple[int, int]:
    for index, row in enumerate(rows[:scan]):
        values = [cell_text(value) for value in row]
        found = _header_index(values, aliases)
        if found is not None:
            return index, found
    raise ValueError(f"could not find headers {aliases} in the first {scan} rows")


def read_sheet_rows(path: Path, sheet=None, sheet_index: int | None = None) -> list[tuple]:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        if sheet is not None:
            wanted = sheet.lower()
            ws = next((item for item in workbook.worksheets if item.title.strip().lower() == wanted), None)
            if ws is None:
                raise ValueError(f"{path.name}: no sheet named {sheet!r}")
        elif sheet_index is not None:
            ws = workbook.worksheets[sheet_index]
        else:
            ws = workbook.worksheets[0]
        return [tuple(row) for row in ws.iter_rows(values_only=True)]
    finally:
        workbook.close()


def parse_po_extract(path: Path) -> list[dict]:
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        rows = payload.get("shops") or payload.get("rows") or payload
        shops = []
        seen = set()
        for row in rows:
            shop_id = normalize_shop_id(row.get("NewCo ID") or row.get("id") or row.get("shop_id"))
            if not shop_id or shop_id in seen:
                continue
            seen.add(shop_id)
            shops.append({"id": shop_id, "opening_date": parse_date(row.get("Projected Opening Date") or row.get("opening_date"))})
        return shops
    rows = read_sheet_rows(path)
    header_i, id_i = _detect_header_row(rows, PO_ID_HEADERS)
    date_i = _header_index([cell_text(value) for value in rows[header_i]], PO_DATE_HEADERS)
    if date_i is None:
        raise ValueError(f"{path.name}: no Projected Opening Date column")
    shops = []
    seen = set()
    for row in rows[header_i + 1 :]:
        shop_id = normalize_shop_id(row[id_i] if id_i < len(row) else None)
        if not shop_id or shop_id in seen:
            continue
        seen.add(shop_id)
        shops.append({"id": shop_id, "opening_date": parse_date(row[date_i] if date_i < len(row) else None)})
    return shops


def _parse_order_rows(rows: list[tuple], qty_headers: tuple[str, ...], preferred_date: tuple[str, ...]) -> list[dict]:
    header_i, id_i = _detect_header_row(rows, CUSTOMER_HEADERS)
    header = [cell_text(value) for value in rows[header_i]]
    item_i = _header_index(header, ITEM_HEADERS)
    qty_i = _header_index(header, qty_headers)
    requested_i = _header_index(header, REQUESTED_HEADERS)
    shipping_i = _header_index(header, SHIPPING_HEADERS)
    parsed = []
    for row in rows[header_i + 1 :]:
        shop_id = normalize_shop_id(row[id_i] if id_i < len(row) else None)
        if not shop_id:
            continue
        item = cell_text(row[item_i] if item_i is not None and item_i < len(row) else None)
        qty = parse_qty(row[qty_i] if qty_i is not None and qty_i < len(row) else None)
        requested = parse_date(row[requested_i] if requested_i is not None and requested_i < len(row) else None)
        shipping = parse_date(row[shipping_i] if shipping_i is not None and shipping_i < len(row) else None)
        parsed.append(
            {
                "id": shop_id,
                "item": item,
                "qty": qty,
                "requested_date": requested,
                "shipping_date": shipping,
            }
        )
    return parsed


def parse_orders_report(path: Path) -> tuple[list[dict], list[dict]]:
    if path.suffix.lower() == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload.get("booked") or [], payload.get("shipped") or []
    try:
        booked_rows = read_sheet_rows(path, sheet="Booked Orders")
    except ValueError:
        booked_rows = read_sheet_rows(path, sheet_index=0)
    try:
        shipped_rows = read_sheet_rows(path, sheet="Shipped Orders")
    except ValueError:
        shipped_rows = read_sheet_rows(path, sheet_index=1)
    booked = _parse_order_rows(booked_rows, ORDERED_QTY_HEADERS, REQUESTED_HEADERS)
    shipped = _parse_order_rows(shipped_rows, SHIPPED_QTY_HEADERS, SHIPPING_HEADERS)
    return booked, shipped


def _collapse(rows: list[dict], source: str) -> dict[str, dict]:
    grouped: dict[str, dict] = {}
    for row in rows:
        if not is_target_item(row.get("item")):
            continue
        shop_id = normalize_shop_id(row.get("id"))
        if not shop_id:
            continue
        when = row.get("shipping_date") if source == "shipped" else row.get("requested_date")
        if source == "shipped" and when is None:
            when = row.get("requested_date")
        qty = int(row.get("qty") or 0)
        current = grouped.get(shop_id)
        if current is None:
            grouped[shop_id] = {"id": shop_id, "qty": qty, "date": when, "source": source}
            continue
        current["qty"] += qty
        if when and (current["date"] is None or when > current["date"]):
            current["date"] = when
    return grouped


def reconcile_order_lifecycle(booked: list[dict], shipped: list[dict]) -> list[dict]:
    """Shipped shops win. Booked-only shops use ordered qty on requested date."""
    shipped_map = _collapse(shipped, "shipped")
    booked_map = _collapse(booked, "booked")
    events = list(shipped_map.values())
    for shop_id, row in booked_map.items():
        if shop_id not in shipped_map:
            events.append(row)
    return sorted(
        [event for event in events if event["qty"] > 0 and event["date"] is not None],
        key=lambda event: (event["date"], event["id"]),
    )


def pending_shops(po_shops: list[dict], ordered_ids: set[str]) -> list[dict]:
    """Keep PO shops that have not been booked or shipped — they are still awaiting MIDs."""
    return [shop for shop in po_shops if shop["id"] not in ordered_ids]


def _add_point(points: list[dict], when: date, inventory: float, series: str) -> None:
    inventory = max(0.0, float(inventory))
    if points and points[-1]["date"] == when.isoformat() and points[-1]["series"] == series:
        points[-1]["inventory"] = round(inventory, 4)
        return
    points.append({"date": when.isoformat(), "inventory": round(inventory, 4), "series": series})


def project_lifecycle(
    events: list[dict],
    pending: list[dict],
    po_shops: list[dict],
    today: date | None = None,
) -> dict:
    today = today or date.today()
    event_dates = [event["date"] for event in events if event.get("date") and event["date"] >= BASELINE_DATE]
    firm_end = max([today, *event_dates], default=today)

    inventory = float(BASELINE_INVENTORY)
    firm: list[dict] = []
    _add_point(firm, BASELINE_DATE, inventory, "firm")

    by_date: dict[date, int] = defaultdict(int)
    for event in events:
        when = event.get("date")
        if when is None or when < BASELINE_DATE or when > firm_end:
            continue
        by_date[when] += int(event["qty"])
    for when in sorted(by_date):
        inventory -= by_date[when]
        _add_point(firm, when, inventory, "firm")
    if firm[-1]["date"] != firm_end.isoformat():
        _add_point(firm, firm_end, inventory, "firm")

    projected: list[dict] = []
    remaining = inventory
    _add_point(projected, firm_end, remaining, "projected")

    pending_by_date: dict[date, int] = defaultdict(int)
    for shop in pending:
        opening = shop.get("opening_date")
        staged = firm_end if opening is None else opening - timedelta(days=STAGING_LEAD_DAYS)
        pending_by_date[max(staged, firm_end)] += DEVICES_PER_SHOP
    for when in sorted(pending_by_date):
        remaining -= pending_by_date[when]
        _add_point(projected, when, remaining, "projected")

    opening_dates = [shop["opening_date"] for shop in po_shops if shop.get("opening_date")]
    pipeline_end = max([firm_end, *opening_dates], default=firm_end)
    if projected[-1]["date"] != pipeline_end.isoformat():
        _add_point(projected, pipeline_end, remaining, "projected")

    cursor = pipeline_end
    while remaining > 0:
        cursor += timedelta(days=1)
        remaining = max(0.0, remaining - DEVICES_PER_DAY)
        if remaining < 1e-9:
            remaining = 0.0
        if remaining == 0 or (cursor - pipeline_end).days % 7 == 0:
            _add_point(projected, cursor, remaining, "projected")

    return {
        "firm": firm,
        "projected": projected,
        "firm_end_date": firm_end,
        "firm_end_inventory": max(0.0, float(inventory)),
        "zero_date": parse_date(projected[-1]["date"]) if projected else firm_end,
        "pipeline_end_date": pipeline_end,
    }


def _points_as_pairs(series: list[dict]) -> list[tuple[date, float]]:
    return [(parse_date(item["date"]), float(item["inventory"])) for item in series]


def crossing_date(series: list[dict], threshold: int) -> date | None:
    pairs = _points_as_pairs(series)
    if not pairs:
        return None
    if pairs[0][1] <= threshold:
        return pairs[0][0]
    for (d0, y0), (d1, y1) in zip(pairs, pairs[1:]):
        if y0 > threshold >= y1:
            if y0 == y1:
                return d1
            frac = (y0 - threshold) / (y0 - y1)
            days = (d1 - d0).days * frac
            crossed = datetime.combine(d0, datetime.min.time()) + timedelta(days=days)
            return crossed.date()
    return None


def crossings_for(projected: list[dict]) -> list[dict]:
    rows = []
    for threshold in THRESHOLDS:
        when = crossing_date(projected, threshold)
        if when is None:
            continue
        rows.append({"threshold": threshold, "date": when.isoformat(), "label": when.strftime("%b %Y")})
    return rows


def awaiting_payload(warnings: list[str] | None = None) -> dict:
    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "awaiting_sources",
        "certified": False,
        "assumptions": {
            "baseline_inventory": BASELINE_INVENTORY,
            "baseline_date": BASELINE_DATE.isoformat(),
            "devices_per_shop": DEVICES_PER_SHOP,
            "shops_per_week": SHOPS_PER_WEEK,
            "devices_per_week": DEVICES_PER_WEEK,
            "staging_lead_days": STAGING_LEAD_DAYS,
            "safety_buffer": SAFETY_BUFFER,
            "order_threshold": ORDER_THRESHOLD,
            "target_item": TARGET_ITEM,
        },
        "thresholds": list(THRESHOLDS),
        "summary": None,
        "series": {"firm": [], "projected": []},
        "crossings": [],
        "gap": None,
        "sources": {},
        "warnings": warnings
        or [
            "Drop PO_Extract_*.xlsx and Daily Dutch Bros Booked Shipped Orders Report*.xlsx into data/raw/payment-devices/ and rerun scripts/import_payment_devices.py."
        ],
    }


def build_payload(raw_dir: Path, today: date | None = None) -> dict:
    po_path = latest_file(raw_dir, PO_NAME)
    orders_path = latest_file(raw_dir, ORDERS_NAME)
    missing = []
    if po_path is None:
        missing.append("PO_Extract_*.xlsx")
    if orders_path is None:
        missing.append("Daily Dutch Bros Booked Shipped Orders Report*.xlsx")
    if missing:
        payload = awaiting_payload([f"Missing {', '.join(missing)}."])
        payload["sources"] = {
            "po_extract": po_path.name if po_path else None,
            "orders_report": orders_path.name if orders_path else None,
        }
        return payload

    today = today or date.today()
    po_shops = parse_po_extract(po_path)
    booked, shipped = parse_orders_report(orders_path)
    events = reconcile_order_lifecycle(booked, shipped)
    ordered_ids = {event["id"] for event in events}
    pending = pending_shops(po_shops, ordered_ids)
    projection = project_lifecycle(events, pending, po_shops, today=today)
    shipped_since = [
        event
        for event in events
        if event["source"] == "shipped" and event["date"] and event["date"] >= BASELINE_DATE
    ]
    warnings = []
    odd_ids = [shop["id"] for shop in po_shops if not NEWCO_RE.match(shop["id"])]
    if odd_ids:
        warnings.append(
            f"{len(odd_ids)} PO NewCo ID(s) are not the expected 2-letter + 4-digit form; matching is still exact."
        )

    pending_units = len(pending) * DEVICES_PER_SHOP
    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "certified",
        "certified": True,
        "assumptions": {
            "baseline_inventory": BASELINE_INVENTORY,
            "baseline_date": BASELINE_DATE.isoformat(),
            "devices_per_shop": DEVICES_PER_SHOP,
            "shops_per_week": SHOPS_PER_WEEK,
            "devices_per_week": DEVICES_PER_WEEK,
            "staging_lead_days": STAGING_LEAD_DAYS,
            "safety_buffer": SAFETY_BUFFER,
            "order_threshold": ORDER_THRESHOLD,
            "target_item": TARGET_ITEM,
        },
        "thresholds": list(THRESHOLDS),
        "chart": {"x_min": BASELINE_DATE.isoformat(), "x_max": CHART_END.isoformat(), "y_min": 0, "y_max": 6000},
        "summary": {
            "baseline_inventory": BASELINE_INVENTORY,
            "as_of": projection["firm_end_date"].isoformat(),
            "firm_inventory": round(projection["firm_end_inventory"], 2),
            "shipped_shops": len(shipped_since),
            "booked_shops": len([event for event in events if event["source"] == "booked"]),
            "po_pipeline_shops": len(po_shops),
            "pending_shops": len(pending),
            "pending_units": pending_units,
            "pipeline_end_date": projection["pipeline_end_date"].isoformat(),
            "zero_date": projection["zero_date"].isoformat() if projection["zero_date"] else None,
        },
        "series": {"firm": projection["firm"], "projected": projection["projected"]},
        "crossings": crossings_for(projection["projected"]),
        "gap": {
            "date": projection["firm_end_date"].isoformat(),
            "inventory": round(projection["firm_end_inventory"], 2),
            "shops": len(pending),
            "units": pending_units,
            "label": (
                f"Pending Orders Gap: {len(pending)} Shops "
                f"({pending_units} units) in PO Pipeline awaiting MIDs/Booking."
            ),
        },
        "sources": {"po_extract": po_path.name, "orders_report": orders_path.name},
        "warnings": warnings,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    parser.add_argument("--out", type=Path, default=PROCESSED)
    parser.add_argument("--as-of", dest="as_of", default=None, help="Firm-line cutoff date (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args(argv)

    args.raw.mkdir(parents=True, exist_ok=True)
    today = parse_date(args.as_of) if args.as_of else date.today()
    payload = build_payload(args.raw, today=today)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(json_ready(payload), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    if payload["certified"]:
        summary = payload["summary"]
        print(
            f"Firm inventory {summary['firm_inventory']:.0f} as of {summary['as_of']}; "
            f"{summary['pending_shops']} pending shops ({summary['pending_units']} units); "
            f"{summary['shipped_shops']} shipped since Feb 2026."
        )
    else:
        print(payload["warnings"][0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
