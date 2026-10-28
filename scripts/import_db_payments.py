#!/usr/bin/env python3
"""Combine weekly DB Payments updates for Ravi into one private payload.

Each week's update lands as data/raw/db-payments/db_payments_update_YYYYMMDD.json,
where YYYYMMDD is the Monday of that week. The published copy is encrypted with
its own password (DB_PAYMENTS_PASSWORD), not the dashboard key.

Usage:
    python3 scripts/import_db_payments.py           # write data/processed/db_payments.json
    python3 scripts/import_db_payments.py --check   # fail if processed drifted from raw
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "db-payments"
PROCESSED = ROOT / "data" / "processed" / "db_payments.json"

FILE_RE = re.compile(r"^db_payments_update_(20\d{2})(\d{2})(\d{2})\.json$")
STATUSES = ("done", "in progress", "blocked", "next")
PROJECT_STATUSES = ("In Progress", "On Hold", "Closed")
OWNERS = ("Krishna", "Ravi")
STRING_LISTS = ("wins", "stuck", "open_detail", "ravi_notes", "next", "asks")


def _strings(value) -> bool:
    return isinstance(value, list) and all(isinstance(entry, str) and entry.strip() for entry in value)


def validate(update: dict, week: date, name: str) -> list[str]:
    errors = []
    if update.get("week_start") != week.isoformat():
        errors.append(f"{name}: week_start must be {week.isoformat()} to match the filename")
    if week.weekday() != 0:
        errors.append(f"{name}: the filename date must be a Monday")
    if not str(update.get("summary") or "").strip():
        errors.append(f"{name}: summary is required")
    items = update.get("items", [])
    if not isinstance(items, list):
        errors.append(f"{name}: items must be a list")
        items = []
    for index, item in enumerate(items):
        if not str(item.get("text") or "").strip():
            errors.append(f"{name}: items[{index}] needs text")
        if item.get("status") not in STATUSES:
            errors.append(f"{name}: items[{index}] status must be one of {', '.join(STATUSES)}")
    for key in STRING_LISTS:
        if not _strings(update.get(key, [])):
            errors.append(f"{name}: {key} must be a list of sentences")
    if not _strings(update.get("top_priorities", [])) or len(update.get("top_priorities", [])) > 3:
        errors.append(f"{name}: top_priorities must be up to three sentences")
    for key in ("projects", "side_quests"):
        rows = update.get(key, [])
        if not isinstance(rows, list):
            errors.append(f"{name}: {key} must be a list")
            continue
        for index, row in enumerate(rows):
            if not isinstance(row, dict):
                errors.append(f"{name}: {key}[{index}] must be an object")
                continue
            if not str(row.get("name") or "").strip():
                errors.append(f"{name}: {key}[{index}] needs a name")
            if not str(row.get("this_week") or "").strip():
                errors.append(f"{name}: {key}[{index}] needs this_week")
            if key == "projects" and row.get("status") not in PROJECT_STATUSES:
                errors.append(f"{name}: projects[{index}] status must be one of {', '.join(PROJECT_STATUSES)}")
            if key == "side_quests" and not str(row.get("status") or "").strip():
                errors.append(f"{name}: side_quests[{index}] needs a status")
    actions = update.get("action_items", [])
    if not isinstance(actions, list):
        errors.append(f"{name}: action_items must be a list")
        actions = []
    for index, action in enumerate(actions):
        if not isinstance(action, dict) or action.get("owner") not in OWNERS:
            errors.append(f"{name}: action_items[{index}] owner must be one of {', '.join(OWNERS)}")
        elif not str(action.get("text") or "").strip():
            errors.append(f"{name}: action_items[{index}] needs text")
    return errors


def build(raw_dir: Path = RAW_DIR) -> str:
    updates = []
    errors = []
    for path in sorted(raw_dir.glob("db_payments_update_*.json")):
        match = FILE_RE.match(path.name)
        if not match:
            errors.append(f"{path.name}: name must be db_payments_update_YYYYMMDD.json")
            continue
        week = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        update = json.loads(path.read_text(encoding="utf-8"))
        errors.extend(validate(update, week, path.name))
        updates.append(update)
    if errors:
        raise ValueError("\n".join(errors))
    updates.sort(key=lambda item: item["week_start"], reverse=True)
    payload = {
        "title": "DB Payments",
        "audience": "Ravi and Krishna",
        "latest_week": updates[0]["week_start"] if updates else None,
        "updates": updates,
    }
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    parser.add_argument("--out", type=Path, default=PROCESSED)
    parser.add_argument("--check", action="store_true", help="verify the processed file matches the raw updates")
    args = parser.parse_args(argv)

    try:
        rendered = build(args.raw)
    except ValueError as err:
        print(f"ERROR {err}", file=sys.stderr)
        return 1
    if args.check:
        if not args.out.is_file() or args.out.read_text(encoding="utf-8") != rendered:
            print(
                f"{args.out.relative_to(ROOT)} does not match data/raw/db-payments. "
                "Run python3 scripts/import_db_payments.py and re-encrypt.",
                file=sys.stderr,
            )
            return 1
        print("DB Payments updates match data/raw/db-payments.")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.out.relative_to(ROOT)} ({json.loads(rendered)['latest_week'] or 'no updates yet'})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
