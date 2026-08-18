#!/usr/bin/env python3
"""Validate an In Shop POS sales export and copy it into the published site data.

Usage:
    python3 scripts/import_pos_sales.py ~/Downloads/reports/kpi_tracking/snowflake/in_shop_sales_data.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "site" / "preview" / "data" / "in_shop_sales_data.json",
    ROOT / "site" / "data" / "in_shop_sales_data.json",
]

AMOUNT_KEYS = (
    "amount",
    "amt",
    "dollar_volume",
    "sales_amt",
    "SALES_VOLUME",
    "sales_volume",
    "total",
    "total_amount",
    "value",
)
LABEL_KEYS = ("label", "tender", "tender_type", "payment_type", "name", "type")
TOTAL_KEYS = ("sales_amt", "SALES_VOLUME", "sales_volume", "total_sales", "net_sales", "total")


def first_number(source: dict, keys: tuple[str, ...]) -> float | None:
    for key in keys:
        value = source.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return None


def extract_weeks(payload) -> list[dict]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("weeks", "data", "periods"):
            if isinstance(payload.get(key), list):
                return payload[key]
        return [payload]
    return []


def tender_rows(week: dict) -> list[dict]:
    raw = week.get("tender_mix") or week.get("tenders") or week.get("mix")
    if isinstance(raw, list):
        return [row for row in raw if isinstance(row, dict)]
    if isinstance(raw, dict):
        rows = []
        for key, value in raw.items():
            if isinstance(value, dict):
                rows.append({**value, "label": value.get("label", key)})
            elif isinstance(value, (int, float)):
                rows.append({"label": key, "amount": value})
        return rows
    return []


def validate(payload) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []

    root_coverage = {}
    if isinstance(payload, dict):
        root_coverage = payload.get("shop_coverage") or payload.get("coverage") or {}

    weeks = extract_weeks(payload)
    if not weeks:
        errors.append("No weeks found. Expected an array of weeks or an object with a 'weeks' array.")
        return errors, warnings

    for index, week in enumerate(weeks):
        where = f"week[{index}]"
        if not isinstance(week, dict):
            errors.append(f"{where} is not an object")
            continue

        rows = tender_rows(week)
        if not rows:
            errors.append(f"{where} has no tender_mix entries")
            continue

        labels = []
        total = 0.0
        for row in rows:
            label = next((row[k] for k in LABEL_KEYS if isinstance(row.get(k), str)), None)
            amount = first_number(row, AMOUNT_KEYS)
            if label is None:
                errors.append(f"{where} tender row missing a label field {LABEL_KEYS}")
                continue
            if amount is None:
                errors.append(f"{where} tender '{label}' missing a numeric amount field {AMOUNT_KEYS}")
                continue
            if amount < 0:
                warnings.append(f"{where} tender '{label}' is negative ({amount})")
            labels.append(label)
            total += amount

        expected = {"Card", "Cash", "Gift Card / Dutch Pass"}
        missing = expected - set(labels)
        if missing:
            warnings.append(f"{where} is missing expected tender labels: {sorted(missing)}")

        reported = first_number(week.get("totals") or {}, TOTAL_KEYS)
        if reported is not None and total and abs(reported - total) / max(total, 1) > 0.01:
            warnings.append(
                f"{where} totals ({reported:,.2f}) differ from tender sum ({total:,.2f}) by more than 1%"
            )

        coverage = week.get("shop_coverage") or week.get("coverage") or root_coverage
        if not coverage:
            warnings.append(f"{where} has no shop_coverage block; the missing-shops banner cannot render")
        else:
            missing_count = first_number(coverage, ("missing_shops_count", "missing_count", "missing_shops"))
            if missing_count is None:
                warnings.append(f"{where} shop_coverage has no missing_shops_count")
            elif missing_count > 0 and not coverage.get("missing_shops_note"):
                warnings.append(
                    f"{where} reports {int(missing_count)} missing shops but no missing_shops_note for the tooltip"
                )

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Path to the exported in_shop_sales_data.json")
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="Copy to the preview site only, leaving the leadership page unchanged",
    )
    args = parser.parse_args()

    source = args.source.expanduser()
    if not source.is_file():
        print(f"ERROR: file not found: {source}")
        return 1

    try:
        payload = json.loads(source.read_text())
    except json.JSONDecodeError as err:
        print(f"ERROR: {source} is not valid JSON: {err}")
        return 1

    errors, warnings = validate(payload)
    for warning in warnings:
        print(f"WARNING {warning}")
    if errors:
        for error in errors:
            print(f"ERROR   {error}")
        print("\nNot copied. Fix the export and rerun.")
        return 1

    targets = TARGETS[:1] if args.preview_only else TARGETS
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        print(f"Copied to {target.relative_to(ROOT)}")

    weeks = extract_weeks(payload)
    print(f"\nValidated {len(weeks)} week(s). {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
