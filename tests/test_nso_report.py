from pathlib import Path

import pandas as pd

from nso_reminders.report import REPORT_COLUMNS, write_exceptions_report


def test_write_exceptions_report_columns(tmp_path: Path):
    path = tmp_path / "PO_Reporting_Exceptions_081726.xlsx"
    write_exceptions_report(
        path,
        [
            {
                "NewCo ID": "CA2908",
                "Projected Opening": "2026-08-21",
                "Days Until Opening": 4,
                "First Tamper Check": "No Devices",
                "Franchisee/Operator": "Codi Crain",
                "Resolved Emails": "",
                "Action": "exception",
                "Exception Type": "no_devices",
                "Description": "Shop has no devices yet.",
                "Recommended Action": "Wait for devices.",
                "Draft / Message ID": "",
            }
        ],
    )
    df = pd.read_excel(path)
    assert list(df.columns) == REPORT_COLUMNS
    assert df.iloc[0]["Exception Type"] == "no_devices"
    assert "no devices" in df.iloc[0]["Description"].lower()
