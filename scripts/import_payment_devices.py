#!/usr/bin/env python3
"""Build the Verifone e285 burndown from dropped-in source files.

Drop the latest vendor text, PO extract, and orders report into
`data/raw/payment-devices/` and rerun. The importer always picks the newest
matching files, so a new drop updates the published JSON.

Usage:
    python3 scripts/import_payment_devices.py
    python3 scripts/import_payment_devices.py --raw data/raw/payment-devices
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

DEVICES_PER_SHOP = 10
SHOPS_PER_WEEK = 5.5
DEVICES_PER_WEEK = DEVICES_PER_SHOP * SHOPS_PER_WEEK
DEVICES_PER_DAY = DEVICES_PER_WEEK / 7
THRESHOLDS = (3000, 2500, 2000, 1500, 1000)
SAFETY_BUFFER = 1000
ORDER_THRESHOLD = 2500

PO_NAME = re.compile(r"PO_Extract_.*\.xlsx$", re.I)
ORDERS_NAME = re.compile(r"Daily Dutch Bros Booked Shipped Orders Report.*\.xlsx$", re.I)
VENDOR_NAME = re.compile(r"(vendor|kimlie|inventory).*\.txt$", re.I)
BALANCE_RE = re.compile(r"remaining\s+balance[^0-9]*([0-9][0-9,]*)", re.I)
DATE_RE = re.compile(r"(?:date|as of)[^0-9]*(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}/\d{2,4})", re.I)
ISO_IN_NAME = re.compile(r"(20\d{2})[-_]?(\d{2})[-_]?(\d{2})")
NEWCO_RE = re.compile(r"^[A-Za-z]{2}\d{4}$")

PO_ID_HEADERS = ("newco id", "newcoid", "newco_id", "shop id", "shop_id")
PO_DATE_HEADERS = (
    "projected opening date",
    "projected_opening_date",
    "opening date",
    "open date",
)
CUSTOMER_HEADERS = ("end customer name", "end_customer_name", "end customer")


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


def cell_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def normalize_shop_id(value) -> str:
    """Exact 1:1 match on the 6-character store id, after trimming Excel padding."""
    return cell_text(value)


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


def parse_vendor_text(text: str) -> tuple[int, date]:
    balance_match = BALANCE_RE.search(text or "")
    date_match = DATE_RE.search(text or "")
    if not balance_match:
        raise ValueError("vendor text has no Remaining balance")
    if not date_match:
        raise ValueError("vendor text has no Date")
    balance = int(balance_match.group(1).replace(",", ""))
    as_of = parse_date(date_match.group(1))
    if as_of is None:
        raise ValueError(f"vendor date is not parseable: {date_match.group(1)}")
    return balance, as_of


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
    rows = read_sheet_rows(path)
    header_i, id_i = _detect_header_row(rows, PO_ID_HEADERS)
    date_i = _header_index([cell_text(value) for value in rows[header_i]], PO_DATE_HEADERS)
    if date_i is None:
        raise ValueError(f"{path.name}: no Projected Opening Date column")
    shops = []
    seen = set()
    for row in rows[header_i + 1 :]:
        shop_id = normalize_shop_id(row[id_i] if id_i < len(row) else None)
        if not shop_id:
            continue
        if shop_id in seen:
            continue
        seen.add(shop_id)
        opening = parse_date(row[date_i] if date_i < len(row) else None)
        shops.append({"id": shop_id, "opening_date": opening})
    return shops


def parse_customer_ids(path: Path, sheet: str, sheet_index: int) -> list[str]:
    try:
        rows = read_sheet_rows(path, sheet=sheet)
    except ValueError:
        rows = read_sheet_rows(path, sheet_index=sheet_index)
    header_i, col_i = _detect_header_row(rows, CUSTOMER_HEADERS)
    ids = []
    seen = set()
    for row in rows[header_i + 1 :]:
        shop_id = normalize_shop_id(row[col_i] if col_i < len(row) else None)
        if not shop_id or shop_id in seen:
            continue
        seen.add(shop_id)
        ids.append(shop_id)
    return ids


def unfulfilled_shops(po_shops: list[dict], shipped_ids: set[str]) -> list[dict]:
    """Keep PO shops whose NewCo ID is not in the shipped End Customer Name set."""
    return [shop for shop in po_shops if shop["id"] not in shipped_ids]


def _add_point(points: list[dict], when: date, inventory: float, series: str) -> None:
    inventory = max(0.0, float(inventory))
    if points and points[-1]["date"] == when.isoformat() and points[-1]["series"] == series:
        points[-1]["inventory"] = round(inventory, 4)
        return
    points.append({"date": when.isoformat(), "inventory": round(inventory, 4), "series": series})


def project_burndown(
    start_inventory: int,
    start_date: date,
    unfulfilled: list[dict],
    po_shops: list[dict],
) -> dict:
    inventory = float(start_inventory)
    pipeline: list[dict] = []
    _add_point(pipeline, start_date, inventory, "pipeline")

    past_due = [shop for shop in unfulfilled if shop["opening_date"] is None or shop["opening_date"] <= start_date]
    future = [shop for shop in unfulfilled if shop["opening_date"] is not None and shop["opening_date"] > start_date]

    if past_due:
        inventory -= len(past_due) * DEVICES_PER_SHOP
        _add_point(pipeline, start_date, inventory, "pipeline")

    by_date: dict[date, int] = defaultdict(int)
    for shop in future:
        by_date[shop["opening_date"]] += 1
    for when in sorted(by_date):
        inventory -= by_date[when] * DEVICES_PER_SHOP
        _add_point(pipeline, when, inventory, "pipeline")

    opening_dates = [shop["opening_date"] for shop in po_shops if shop["opening_date"]]
    pipeline_end_date = max([start_date, *opening_dates], default=start_date)
    if pipeline[-1]["date"] != pipeline_end_date.isoformat():
        _add_point(pipeline, pipeline_end_date, inventory, "pipeline")

    run_rate: list[dict] = []
    _add_point(run_rate, pipeline_end_date, inventory, "runRate")
    cursor = pipeline_end_date
    remaining = inventory
    while remaining > 0:
        cursor += timedelta(days=1)
        remaining = max(0.0, remaining - DEVICES_PER_DAY)
        if remaining < 1e-9:
            remaining = 0.0
        # Keep weekly samples plus the zero crossing to avoid a 500-point blob
        # while still drawing a smooth dashed line.
        if remaining == 0 or (cursor - pipeline_end_date).days % 7 == 0:
            _add_point(run_rate, cursor, remaining, "runRate")
    if remaining == 0 and run_rate[-1]["inventory"] != 0:
        _add_point(run_rate, cursor, 0, "runRate")

    depletion_end = parse_date(run_rate[-1]["date"]) if run_rate else pipeline_end_date
    return {
        "pipeline": pipeline,
        "runRate": run_rate,
        "pipeline_end_date": pipeline_end_date,
        "pipeline_end_inventory": max(0.0, inventory),
        "zero_date": depletion_end,
        "past_due_shops": len(past_due),
    }


def _points_as_pairs(series: list[dict]) -> list[tuple[date, float]]:
    return [(parse_date(item["date"]), float(item["inventory"])) for item in series]


def crossing_date(series: list[dict], threshold: int) -> date | None:
    """First date the remaining inventory is at or below the threshold."""
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


def crossings_for(pipeline: list[dict], run_rate: list[dict]) -> list[dict]:
    combined = pipeline + [point for point in run_rate if point["date"] != pipeline[-1]["date"]]
    rows = []
    for threshold in THRESHOLDS:
        when = crossing_date(combined, threshold)
        if when is None:
            continue
        rows.append(
            {
                "threshold": threshold,
                "date": when.isoformat(),
                "label": when.strftime("%b %Y"),
            }
        )
    return rows


def awaiting_payload(warnings: list[str] | None = None) -> dict:
    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "awaiting_sources",
        "certified": False,
        "assumptions": {
            "devices_per_shop": DEVICES_PER_SHOP,
            "shops_per_week": SHOPS_PER_WEEK,
            "devices_per_week": DEVICES_PER_WEEK,
            "safety_buffer": SAFETY_BUFFER,
            "order_threshold": ORDER_THRESHOLD,
        },
        "thresholds": list(THRESHOLDS),
        "summary": None,
        "series": {"pipeline": [], "runRate": []},
        "crossings": [],
        "sources": {},
        "warnings": warnings
        or [
            "Drop the vendor inventory text, PO_Extract_*.xlsx, and Daily Dutch Bros Booked Shipped Orders Report*.xlsx into data/raw/payment-devices/ and rerun scripts/import_payment_devices.py."
        ],
    }


def build_payload(raw_dir: Path) -> dict:
    vendor_path = latest_file(raw_dir, VENDOR_NAME) or next(iter(sorted(raw_dir.glob("*.txt"))), None)
    po_path = latest_file(raw_dir, PO_NAME)
    orders_path = latest_file(raw_dir, ORDERS_NAME)
    missing = []
    if vendor_path is None:
        missing.append("vendor inventory text")
    if po_path is None:
        missing.append("PO_Extract_*.xlsx")
    if orders_path is None:
        missing.append("Daily Dutch Bros Booked Shipped Orders Report*.xlsx")
    if missing:
        payload = awaiting_payload([f"Missing {', '.join(missing)}."])
        payload["sources"] = {
            "vendor": vendor_path.name if vendor_path else None,
            "po_extract": po_path.name if po_path else None,
            "orders_report": orders_path.name if orders_path else None,
        }
        return payload

    start_inventory, start_date = parse_vendor_text(vendor_path.read_text(encoding="utf-8"))
    po_shops = parse_po_extract(po_path)
    shipped_ids = set(parse_customer_ids(orders_path, "Shipped Orders", 1))
    booked_ids = set(parse_customer_ids(orders_path, "Booked Orders", 0))
    remaining = unfulfilled_shops(po_shops, shipped_ids)
    projection = project_burndown(start_inventory, start_date, remaining, po_shops)
    warnings = []
    odd_ids = [shop["id"] for shop in po_shops if not NEWCO_RE.match(shop["id"])]
    if odd_ids:
        warnings.append(
            f"{len(odd_ids)} PO NewCo ID(s) are not the expected 2-letter + 4-digit form; matching is still exact."
        )

    return {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": "certified",
        "certified": True,
        "assumptions": {
            "devices_per_shop": DEVICES_PER_SHOP,
            "shops_per_week": SHOPS_PER_WEEK,
            "devices_per_week": DEVICES_PER_WEEK,
            "safety_buffer": SAFETY_BUFFER,
            "order_threshold": ORDER_THRESHOLD,
        },
        "thresholds": list(THRESHOLDS),
        "summary": {
            "starting_inventory": start_inventory,
            "as_of": start_date.isoformat(),
            "po_pipeline_shops": len(po_shops),
            "shipped_shops": len(shipped_ids),
            "booked_shops": len(booked_ids),
            "unfulfilled_shops": len(remaining),
            "past_due_unfulfilled": projection["past_due_shops"],
            "pipeline_end_date": projection["pipeline_end_date"].isoformat(),
            "pipeline_end_inventory": round(projection["pipeline_end_inventory"], 2),
            "zero_date": projection["zero_date"].isoformat() if projection["zero_date"] else None,
        },
        "series": {
            "pipeline": projection["pipeline"],
            "runRate": projection["runRate"],
        },
        "crossings": crossings_for(projection["pipeline"], projection["runRate"]),
        "sources": {
            "vendor": vendor_path.name,
            "po_extract": po_path.name,
            "orders_report": orders_path.name,
        },
        "warnings": warnings,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    parser.add_argument("--out", type=Path, default=PROCESSED)
    args = parser.parse_args(argv)

    args.raw.mkdir(parents=True, exist_ok=True)
    payload = build_payload(args.raw)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(json_ready(payload), indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}")
    if payload["certified"]:
        summary = payload["summary"]
        print(
            f"Starting {summary['starting_inventory']} on {summary['as_of']}; "
            f"{summary['unfulfilled_shops']} unfulfilled of {summary['po_pipeline_shops']} PO shops; "
            f"pipeline ends {summary['pipeline_end_date']} at {summary['pipeline_end_inventory']:.0f} devices."
        )
    else:
        print(payload["warnings"][0])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
