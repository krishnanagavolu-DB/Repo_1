#!/usr/bin/env python3
"""NSO device health for the shops opening in a given week.

Shops and First Tamper Check come from the newest PO scrape. Stratix to shop
uses that file's Verifone shipped and delivered dates. Verifone to Stratix
uses the booked and shipped orders report. An iTraq report is not in the drop,
so a shipment that has left Verifone but has no delivery date stays In transit.

Usage:
    python3 scripts/import_nso_health.py
    python3 scripts/import_nso_health.py --check
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_payment_devices as devices  # noqa: E402

PROCESSED = ROOT / "data" / "processed" / "nso_health.json"

VERIFONE_DELIVERED = "Delivered"
VERIFONE_TRANSIT = "In transit"
VERIFONE_NONE = "Not delivered"
STRATIX_NONE = "Not shipped"
STRATIX_TRANSIT = "Shipped and in transit"
STRATIX_DELIVERED = "Delivered"


def _column(header: list[str], *needles: str) -> int | None:
    lowered = [cell.lower() for cell in header]
    for needle in needles:
        for index, name in enumerate(lowered):
            if needle in name:
                return index
    return None


def _cell(row: tuple, index: int | None):
    if index is None or index >= len(row):
        return None
    return row[index]


def stratix_to_shop(shipped: date | None, delivered: date | None, as_of: date) -> str:
    """PO scrape dates for the hop from Stratix to the shop."""
    if shipped is None:
        return STRATIX_NONE
    if delivered is None or delivered > as_of:
        return STRATIX_TRANSIT
    return STRATIX_DELIVERED


def verifone_to_stratix(shipped: bool, booked: bool) -> str:
    """Orders report for the hop from Verifone. iTraq would split transit from arrival."""
    if shipped:
        return VERIFONE_DELIVERED
    if booked:
        return VERIFONE_TRANSIT
    return VERIFONE_NONE


def read_po_rows(path: Path) -> list[dict]:
    rows = devices.read_sheet_rows(path)
    header_i, id_i = devices._detect_header_row(rows, devices.PO_ID_HEADERS)
    header = [devices.cell_text(value) for value in rows[header_i]]
    opening_i = devices._header_index(header, devices.PO_DATE_HEADERS)
    tamper_i = _column(header, "first tamper check")
    ship_i = _column(header, "verifone device shipped")
    deliver_i = _column(header, "verifone device delivered")
    owner_i = _column(header, "franchise / company", "company owned")
    city_i = _column(header, "city")
    state_i = _column(header, "state")
    if opening_i is None or tamper_i is None:
        raise ValueError(f"{path.name}: PO scrape is missing opening date or First Tamper Check")
    shops = []
    seen = set()
    for row in rows[header_i + 1 :]:
        shop_id = devices.normalize_shop_id(_cell(row, id_i))
        if not shop_id or shop_id in seen:
            continue
        seen.add(shop_id)
        shops.append(
            {
                "id": shop_id,
                "opening_date": devices.parse_date(_cell(row, opening_i)),
                "ownership": devices.cell_text(_cell(row, owner_i)),
                "city": devices.cell_text(_cell(row, city_i)),
                "state": devices.cell_text(_cell(row, state_i)),
                "tamper": devices.cell_text(_cell(row, tamper_i)) or "—",
                "shipped_on": devices.parse_date(_cell(row, ship_i)),
                "delivered_on": devices.parse_date(_cell(row, deliver_i)),
            }
        )
    return shops


def build_payload(raw_dir: Path | None = None) -> dict:
    raw_dir = raw_dir or devices.RAW_DIR
    po_path = devices.latest_file(raw_dir, devices.PO_NAME)
    orders_path = devices.latest_file(raw_dir, devices.ORDERS_NAME)
    if po_path is None or orders_path is None:
        raise ValueError("NSO health needs a PO scrape and a booked/shipped orders report")
    as_of = devices.report_extract_date(orders_path) or devices.file_stamp(po_path)
    po_rows = read_po_rows(po_path)
    booked, shipped = devices.parse_orders_report(orders_path)
    events = devices.reconcile_order_lifecycle(booked, shipped, booked_date=as_of)
    shipped_ids = {event["id"] for event in events if event["source"] == "shipped"}
    booked_ids = {event["id"] for event in events if event["source"] == "booked"}
    shops = []
    for row in po_rows:
        if row["opening_date"] is None:
            continue
        shops.append(
            {
                "id": row["id"],
                "opening_date": row["opening_date"].isoformat(),
                "ownership": row["ownership"],
                "city": row["city"],
                "state": row["state"],
                "verifone_to_stratix": verifone_to_stratix(row["id"] in shipped_ids, row["id"] in booked_ids),
                "stratix_to_shop": stratix_to_shop(row["shipped_on"], row["delivered_on"], as_of),
                "first_tamper_check": row["tamper"],
            }
        )
    shops.sort(key=lambda shop: (shop["opening_date"], shop["id"]))
    return {
        "as_of": as_of.isoformat(),
        "sources": {
            "po_extract": po_path.name,
            "orders_report": orders_path.name,
            "itraq": None,
        },
        "notes": [
            "iTraq is not in this drop. Verifone to Stratix uses the booked and shipped orders report: shipped is Delivered, booked only is In transit, and no order is Not delivered.",
            "Stratix to shop uses the PO scrape. No shipped date is Not shipped. A shipped date without a delivery by the report date is Shipped and in transit. A delivery date on or before that date is Delivered.",
            "First Tamper Check is the status on the PO scrape.",
        ],
        "shops": shops,
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=devices.RAW_DIR)
    parser.add_argument("--out", type=Path, default=PROCESSED)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    payload = build_payload(args.raw)
    rendered = json.dumps(devices.json_ready(payload), indent=2) + "\n"
    if args.check:
        if not args.out.is_file() or args.out.read_text(encoding="utf-8") != rendered:
            print("nso_health.json does not match the newest PO scrape and orders report.", file=sys.stderr)
            return 1
        print(f"NSO health matches {payload['sources']['po_extract']} ({len(payload['shops'])} shops).")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.out} ({len(payload['shops'])} shops as of {payload['as_of']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
