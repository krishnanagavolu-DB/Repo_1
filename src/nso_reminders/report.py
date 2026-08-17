from __future__ import annotations

from pathlib import Path

import pandas as pd

REPORT_COLUMNS = [
    "NewCo ID",
    "Projected Opening",
    "Days Until Opening",
    "First Tamper Check",
    "Franchisee/Operator",
    "Resolved Emails",
    "Action",
    "Exception Type",
    "Description",
    "Recommended Action",
    "Draft / Message ID",
]


def write_exceptions_report(path: Path, rows: list[dict]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    normalized = []
    for row in rows:
        normalized.append({col: row.get(col, "") for col in REPORT_COLUMNS})
    pd.DataFrame(normalized, columns=REPORT_COLUMNS).to_excel(path, index=False)
    return path
