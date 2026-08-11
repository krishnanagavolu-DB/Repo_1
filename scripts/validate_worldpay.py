#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from worldpay_dashboard.ingest import discover_weeks  # noqa: E402
from worldpay_dashboard.validation import validate_discovered_weeks  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Certify Worldpay raw inputs before publishing the dashboard"
    )
    parser.add_argument("--raw", type=Path, default=ROOT / "data" / "raw")
    parser.add_argument(
        "--dashboard",
        type=Path,
        action="append",
        default=None,
        help="Dashboard JSON copy to compare (repeatable)",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=ROOT / "data" / "processed" / "validation_report.json",
    )
    args = parser.parse_args()

    discovered = discover_weeks(args.raw.resolve())
    dashboard_paths = [path.resolve() for path in (args.dashboard or [])]
    report = validate_discovered_weeks(discovered, dashboard_paths=dashboard_paths)

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    print(
        f"Data certification: {report['status']} "
        f"({report['weeks_checked']} weeks, "
        f"{report['error_count']} errors, {report['warning_count']} warnings)"
    )
    for check in report["checks"]:
        week = f" [{check['week']}]" if check.get("week") else ""
        print(f"{check['severity'].upper()}{week} {check['code']}: {check['message']}")
    print(f"Wrote {args.report}")
    return 1 if report["error_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
