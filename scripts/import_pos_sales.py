#!/usr/bin/env python3
"""Validate In Shop POS sales exports and publish their combined weeks.

Each Snowflake export holds a rolling window, so publishing one alone would
drop older weeks from the trend. Pass every kept extract.

Usage:
    python3 scripts/import_pos_sales.py data/raw/pos-sales/in_shop_sales_data_*.json
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "site" / "preview" / "data" / "in_shop_sales_data.json",
    ROOT / "site" / "data" / "in_shop_sales_data.json",
]

# Shell fields that must agree, or the weeks are measuring different things.
# Shop counts live under `filter`/`shop_coverage` and legitimately move as
# shops open, so those are not compared.
SHARED_METADATA_KEYS = (
    "definitions",
    "methodology",
    "tender_order",
    "week_cadence",
    "environment",
)
START_KEYS = ("week_start_date", "week_start", "week", "period_start", "start_date")

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


def week_start(week: dict) -> str | None:
    for key in START_KEYS:
        value = week.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _missing_mondays(starts: list[str]) -> list[str]:
    """Mondays with no published week between the first and last loaded week."""
    try:
        parsed = sorted(date.fromisoformat(value) for value in starts)
    except ValueError:
        return []
    present = set(parsed)
    gaps = []
    cursor = parsed[0]
    while cursor < parsed[-1]:
        cursor += timedelta(days=7)
        if cursor not in present and cursor != parsed[-1]:
            gaps.append(cursor.isoformat())
    return gaps


def combine_extracts(paths) -> tuple[dict, list[str]]:
    """Merge rolling weekly extracts into one payload, newest extract winning."""
    loaded = []
    for path in paths:
        path = Path(path)
        payload = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError(f"{path.name}: expected a JSON object")
        loaded.append((str(payload.get("generated_at") or ""), path, payload))
    if not loaded:
        raise ValueError("no POS extracts given")

    loaded.sort(key=lambda item: (item[0], item[1].name))

    _base_stamp, base_path, base_payload = loaded[0]
    for _stamp, path, payload in loaded[1:]:
        for key in SHARED_METADATA_KEYS:
            if payload.get(key) != base_payload.get(key):
                raise ValueError(
                    f"divergent {key} metadata between {base_path.name} and {path.name}"
                )

    warnings: list[str] = []
    weeks: dict[str, dict] = {}
    sources: dict[str, Path] = {}
    for _stamp, path, payload in loaded:
        for week in extract_weeks(payload):
            if not isinstance(week, dict):
                continue
            start = week_start(week)
            if start is None:
                raise ValueError(f"{path.name}: a week is missing {START_KEYS[0]}")
            if start in weeks and weeks[start] != week:
                warnings.append(
                    f"week {start} restated by {path.name} (was {sources[start].name})"
                )
            weeks[start] = week
            sources[start] = path

    ordered = [weeks[start] for start in sorted(weeks)]
    for gap in _missing_mondays(sorted(weeks)):
        warnings.append(f"no published week for {gap}; the trend will skip it")

    combined = {**loaded[-1][2], "weeks": ordered}
    return combined, warnings


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
        if coverage:
            # Coverage metadata is kept for certification, but the UI does not
            # advertise non–company-owned exclusions — that filter is by design.
            missing_count = first_number(coverage, ("missing_shops_count", "missing_count", "missing_shops"))
            if missing_count is not None and missing_count < 0:
                warnings.append(f"{where} shop_coverage missing_shops_count is negative")
        else:
            warnings.append(
                f"{where} has no shop_coverage block; certification cannot confirm the company-owned filter footprint"
            )

    return errors, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "source",
        type=Path,
        nargs="+",
        help="Exported in_shop_sales_data_YYYYMMDD.json files (pass every kept extract)",
    )
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="Copy to the preview site only, leaving the leadership page unchanged",
    )
    args = parser.parse_args()

    sources = [path.expanduser() for path in args.source]
    for source in sources:
        if not source.is_file():
            print(f"ERROR: file not found: {source}")
            return 1

    try:
        payload, merge_warnings = combine_extracts(sources)
    except json.JSONDecodeError as err:
        print(f"ERROR: an extract is not valid JSON: {err}")
        return 1
    except ValueError as err:
        print(f"ERROR   {err}")
        print("\nNot copied. Fix the export and rerun.")
        return 1

    errors, warnings = validate(payload)
    for warning in merge_warnings + warnings:
        print(f"WARNING {warning}")
    if errors:
        for error in errors:
            print(f"ERROR   {error}")
        print("\nNot copied. Fix the export and rerun.")
        return 1

    targets = TARGETS[:1] if args.preview_only else TARGETS
    rendered = json.dumps(payload, indent=2) + "\n"
    for target in targets:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(rendered, encoding="utf-8")
        print(f"Wrote {target.relative_to(ROOT)}")

    weeks = extract_weeks(payload)
    print(
        f"\nValidated {len(weeks)} week(s) from {len(sources)} extract(s). "
        f"{len(merge_warnings) + len(warnings)} warning(s)."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
