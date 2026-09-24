from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import pandas as pd

from worldpay_dashboard.kpis import build_dashboard_payload, compute_week_kpis
from worldpay_dashboard.validation import raise_for_errors, validate_discovered_weeks

_WEEK_DIR_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _is_auth(path: Path) -> bool:
    name = path.name.lower()
    return path.suffix.lower() in {".xlsx", ".xls"} and "auth" in name


def _is_interchange(path: Path) -> bool:
    name = path.name.lower()
    return path.suffix.lower() in {".xlsx", ".xls"} and "interchange" in name


def discover_weeks(raw_root: Path) -> list[dict[str, Any]]:
    if not raw_root.exists():
        raise ValueError(f"raw root does not exist: {raw_root}")

    weeks: list[dict[str, Any]] = []
    for child in sorted(raw_root.iterdir()):
        if not child.is_dir() or not _WEEK_DIR_RE.match(child.name):
            continue
        files = [p for p in child.iterdir() if p.is_file()]
        auth_files = [p for p in files if _is_auth(p)]
        ix_files = [p for p in files if _is_interchange(p)]
        if not auth_files or not ix_files:
            missing = []
            if not auth_files:
                missing.append("Auth Summary")
            if not ix_files:
                missing.append("Interchange")
            raise ValueError(
                f"week {child.name} missing required file(s): {', '.join(missing)}"
            )
        if len(auth_files) > 1 or len(ix_files) > 1:
            raise ValueError(f"week {child.name} has ambiguous Auth/Interchange files")
        weeks.append(
            {
                "week_start": child.name,
                "auth": auth_files[0],
                "interchange": ix_files[0],
            }
        )
    if not weeks:
        raise ValueError(f"no week folders found under {raw_root}")
    return weeks


def ingest_raw_tree(raw_root: Path, out_json: Path) -> Path:
    discovered = discover_weeks(raw_root)
    validation_report = validate_discovered_weeks(discovered)
    raise_for_errors(validation_report)
    week_payloads = []
    for item in discovered:
        auth_df = pd.read_excel(item["auth"])
        ix_df = pd.read_excel(item["interchange"])
        week_payloads.append(compute_week_kpis(auth_df, ix_df, item["week_start"]))
    payload = build_dashboard_payload(week_payloads)
    payload["meta"]["data_quality"] = {
        "status": validation_report["status"],
        "certified": validation_report["certified"],
        "weeks_checked": validation_report["weeks_checked"],
        "warning_count": validation_report["warning_count"],
    }
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8")
    return out_json
