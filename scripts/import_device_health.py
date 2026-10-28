#!/usr/bin/env python3
"""Publish the Device Health workbook summary for the preview terminals card.

The workbook is the counted snapshot. This script does not recount VHQ or
iTrac, and it does not mix those counts into the purchase-order burn down.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "device-health"
PROCESSED = ROOT / "data" / "processed" / "device_health.json"

# Summary-sheet labels. Indented rows keep the leading spaces stripped.
LABELS = {
    "in shops": "in_shops",
    "active": "in_shops_active",
    "inactive / pending": "in_shops_inactive",
    "at stratix": "at_stratix",
    "spare pool": "spare_pool",
    "depot": "depot",
    "awaiting nso / deployment": "awaiting_nso",
    "other (ca4505)": "other",
    "location not confirmed (in vhq, not in a shop, not at stratix)": "location_not_confirmed",
    "total e285 in the system": "total",
}


def latest_workbook(directory: Path) -> Path:
    files = sorted(directory.glob("Device_Health_*.xlsx"))
    if not files:
        raise FileNotFoundError(f"no Device_Health workbook in {directory}")
    return files[-1]


def read_summary(path: Path) -> dict:
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        sheet = workbook["Summary"]
        rows = list(sheet.iter_rows(values_only=True))
    finally:
        workbook.close()
    counts: dict[str, int] = {}
    for row in rows:
        label = str(row[0]).strip().lower() if row and row[0] is not None else ""
        key = LABELS.get(label)
        if not key:
            continue
        value = row[1] if len(row) > 1 else None
        if not isinstance(value, (int, float)):
            raise ValueError(f"{path.name}: {label} is not a count")
        counts[key] = int(value)
    missing = [key for key in LABELS.values() if key not in counts]
    if missing:
        raise ValueError(f"{path.name}: summary is missing {', '.join(missing)}")
    parts = counts["in_shops"] + counts["at_stratix"] + counts["location_not_confirmed"]
    if parts != counts["total"]:
        raise ValueError(f"{path.name}: E285 locations {parts} do not add up to {counts['total']}")
    stratix_parts = counts["spare_pool"] + counts["depot"] + counts["awaiting_nso"] + counts["other"]
    if stratix_parts != counts["at_stratix"]:
        raise ValueError(f"{path.name}: Stratix buckets {stratix_parts} do not add up to {counts['at_stratix']}")
    shop_parts = counts["in_shops_active"] + counts["in_shops_inactive"]
    if shop_parts != counts["in_shops"]:
        raise ValueError(f"{path.name}: shop statuses {shop_parts} do not add up to {counts['in_shops']}")
    return counts


def build_payload(directory: Path) -> dict:
    path = latest_workbook(directory)
    return {
        "as_of": "2026-10-28",
        "vhq_as_of": "2026-10-26",
        "itrac_as_of": "2026-10-28",
        "source": path.name,
        "e285": read_summary(path),
        "note": (
            "VHQ and iTrac place each E285 once. Location not confirmed means neither file shows a shop or Stratix; "
            "it is not a lost-device count. These counts are not the purchase order."
        ),
    }


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW)
    parser.add_argument("--out", type=Path, default=PROCESSED)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args(argv)
    payload = build_payload(args.raw)
    rendered = json.dumps(payload, indent=2) + "\n"
    if args.check:
        current = args.out.read_text(encoding="utf-8") if args.out.is_file() else ""
        if current != rendered:
            print("device_health.json does not match the Device Health workbook.", file=sys.stderr)
            return 1
        print(f"Device health matches {payload['source']}.")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
