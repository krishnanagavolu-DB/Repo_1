#!/usr/bin/env python3
"""Publish the newest E235 roadmap drop for the Payment Devices tab.

Each week's roadmap lands as data/raw/e235-roadmap/e235_roadmap_YYYYMMDD.json.
The newest date in the filename wins; older drops stay as history.

Usage:
    python3 scripts/import_e235_roadmap.py           # write data/processed/e235_roadmap.json
    python3 scripts/import_e235_roadmap.py --check   # fail if processed drifted from raw
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "data" / "raw" / "e235-roadmap"
PROCESSED = ROOT / "data" / "processed" / "e235_roadmap.json"

FILE_RE = re.compile(r"^e235_roadmap_(20\d{6})\.json$")
STATUSES = ("done", "current", "next", "then", "later")
LIST_FIELDS = ("commitments", "assumptions", "open_questions")


def latest_raw(raw_dir: Path) -> Path | None:
    dated = []
    for path in raw_dir.glob("e235_roadmap_*.json"):
        match = FILE_RE.match(path.name)
        if match:
            dated.append((match.group(1), path))
    return max(dated)[1] if dated else None


def validate(payload: dict, name: str) -> list[str]:
    errors = []
    try:
        date.fromisoformat(str(payload.get("as_of")))
    except ValueError:
        errors.append(f"{name}: as_of must be an ISO date")
    stages = payload.get("stages")
    if not isinstance(stages, list) or not stages:
        errors.append(f"{name}: stages must be a non-empty list")
        stages = []
    ids = set()
    for index, stage in enumerate(stages):
        where = f"{name}: stages[{index}]"
        for key in ("id", "name", "phase", "column", "status", "definition"):
            if not str(stage.get(key) or "").strip():
                errors.append(f"{where} is missing {key}")
        if stage.get("status") not in STATUSES:
            errors.append(f"{where} status must be one of {', '.join(STATUSES)}")
        if stage.get("id") in ids:
            errors.append(f"{where} repeats id {stage.get('id')!r}")
        ids.add(stage.get("id"))
        if not isinstance(stage.get("milestones"), list):
            errors.append(f"{where} milestones must be a list")
    if sum(1 for stage in stages if stage.get("status") == "current") != 1:
        errors.append(f"{name}: exactly one stage must be current")
    for key in LIST_FIELDS:
        value = payload.get(key)
        if not isinstance(value, list) or not all(isinstance(item, str) and item.strip() for item in value):
            errors.append(f"{name}: {key} must be a list of sentences")
    return errors


def build(raw_dir: Path = RAW_DIR) -> tuple[str, Path]:
    path = latest_raw(raw_dir)
    if path is None:
        raise ValueError(f"no e235_roadmap_YYYYMMDD.json in {raw_dir}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    errors = validate(payload, path.name)
    if errors:
        raise ValueError("\n".join(errors))
    payload["source_file"] = path.name
    return json.dumps(payload, indent=2, ensure_ascii=False) + "\n", path


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw", type=Path, default=RAW_DIR)
    parser.add_argument("--out", type=Path, default=PROCESSED)
    parser.add_argument("--check", action="store_true", help="verify the processed file matches the newest raw drop")
    args = parser.parse_args(argv)

    try:
        rendered, source = build(args.raw)
    except ValueError as err:
        print(f"ERROR {err}", file=sys.stderr)
        return 1
    if args.check:
        if not args.out.is_file() or args.out.read_text(encoding="utf-8") != rendered:
            print(
                f"{args.out.relative_to(ROOT)} does not match {source.name}. "
                "Run python3 scripts/import_e235_roadmap.py and re-encrypt.",
                file=sys.stderr,
            )
            return 1
        print(f"E235 roadmap matches {source.name}.")
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding="utf-8")
    print(f"Wrote {args.out.relative_to(ROOT)} from {source.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
