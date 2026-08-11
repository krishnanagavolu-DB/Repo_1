from pathlib import Path

import pandas as pd

from worldpay_dashboard.validation import validate_discovered_weeks


def _write_week(root: Path, week: str, duplicate_auth: bool = False) -> dict:
    folder = root / week
    folder.mkdir(parents=True)
    auth = pd.DataFrame(
        [
            {
                "Network": "VISA",
                "Entry Mode": "07",
                "Mobile Wallet": "Apple Pay",
                "Auth Response cd": "00",
                "Auth Response": "Approved",
                "Auth Request Cnt": 90,
                "Authorization": 900,
            },
            {
                "Network": "VISA",
                "Entry Mode": "07",
                "Mobile Wallet": None,
                "Auth Response cd": "05",
                "Auth Response": "Do not honor",
                "Auth Request Cnt": 10,
                "Authorization": 100,
            },
        ]
    )
    if duplicate_auth:
        auth = pd.concat([auth, auth.iloc[[0]]], ignore_index=True)
    ix = pd.DataFrame(
        [
            {
                "Card Type": "VISA",
                "Transaction": "SALE",
                "Entry Mode": "07",
                "Mobile Wallet Desc": "Apple Pay",
                "Surcharge Reason": ".",
                "Transaction Cnt": 90,
                "Transaction Amt": 900,
                "Interchange Fee": 18,
            },
            {
                "Card Type": "VISA",
                "Transaction": "RETURN",
                "Entry Mode": "07",
                "Mobile Wallet Desc": "Apple Pay",
                "Surcharge Reason": ".",
                "Transaction Cnt": 1,
                "Transaction Amt": 10,
                "Interchange Fee": 0,
            },
        ]
    )
    auth_path = folder / "Auth_20260810_120000.xlsx"
    ix_path = folder / "Interchange_20260810_120000.xlsx"
    auth.to_excel(auth_path, index=False)
    ix.to_excel(ix_path, index=False)
    return {"week_start": week, "auth": auth_path, "interchange": ix_path}


def test_valid_week_is_certified(tmp_path):
    report = validate_discovered_weeks([_write_week(tmp_path, "2026-08-03")])
    assert report["certified"] is True
    assert report["error_count"] == 0
    assert report["week_summaries"][0]["auth_rate"] == 0.9


def test_exact_duplicate_blocks_publish(tmp_path):
    report = validate_discovered_weeks(
        [_write_week(tmp_path, "2026-08-03", duplicate_auth=True)]
    )
    assert report["certified"] is False
    assert any(check["code"] == "exact_duplicates" for check in report["checks"])


def test_non_monday_folder_blocks_publish(tmp_path):
    report = validate_discovered_weeks([_write_week(tmp_path, "2026-08-04")])
    assert report["certified"] is False
    assert any(check["code"] == "week_not_monday" for check in report["checks"])
