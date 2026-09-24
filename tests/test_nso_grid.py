from datetime import date
from pathlib import Path

import pandas as pd
import pytest

from nso_reminders.grid import load_projected_openings, map_headers, normalize_header


def test_normalize_header_strips_and_lowers():
    assert normalize_header("  Projected Opening Date ") == "projected opening date"
    assert normalize_header("Franchisee/Operator") == "franchisee/operator"


def test_map_headers_matches_truncated_titles():
    cols = [
        "NewCo ID",
        "Turnover",
        "Projected Opening Date",
        "First Tamper Check",
        "Franchise / Company",
        "Franchisee/Operator",
        "City",
        "State",
    ]
    mapping = map_headers(cols)
    assert mapping["newco_id"] == "NewCo ID"
    assert mapping["projected_opening"] == "Projected Opening Date"
    assert mapping["first_tamper_check"] == "First Tamper Check"
    assert mapping["franchisee_operator"] == "Franchisee/Operator"


def test_map_headers_fails_loud_on_missing(tmp_path: Path):
    df = pd.DataFrame([{"NewCo ID": "CA2908", "City": "Fresno"}])
    path = tmp_path / "bad.xlsx"
    df.to_excel(path, index=False)
    with pytest.raises(ValueError, match="projected_opening"):
        load_projected_openings(path)


def test_load_projected_openings_parses_rows(tmp_path: Path):
    df = pd.DataFrame(
        [
            {
                "NewCo ID": "SC0701",
                "Turnover": "Fri 7/31/26",
                "Projected Opening Date": "Wed 8/12/26",
                "First Tamper Check": "Completed",
                "Franchisee/Operator": "Codi Crain",
                "City": "Newberry",
                "State": "SC",
            },
            {
                "NewCo ID": "CA2908",
                "Turnover": "Mon 8/10/26",
                "Projected Opening Date": date(2026, 8, 21),
                "First Tamper Check": "Pending",
                "Franchisee/Operator": "Kyle Radosevich, Natalie Example",
                "City": "Fresno",
                "State": "CA",
            },
        ]
    )
    path = tmp_path / "PO_Grid_081726.xlsx"
    df.to_excel(path, index=False)
    rows = load_projected_openings(path)
    assert rows[0].newco_id == "SC0701"
    assert rows[0].first_tamper_check == "Completed"
    assert rows[1].projected_opening == date(2026, 8, 21)
    assert "Kyle" in rows[1].franchisee_operator
