from pathlib import Path

import pytest

from worldpay_dashboard.ingest import discover_weeks


def test_discover_weeks_requires_both_files(tmp_path: Path):
    week = tmp_path / "2026-08-03"
    week.mkdir()
    (week / "Auth_Summary.xlsx").write_bytes(b"PK")
    with pytest.raises(ValueError, match="missing"):
        discover_weeks(tmp_path)


def test_discover_weeks_happy_path(tmp_path: Path):
    week = tmp_path / "2026-08-03"
    week.mkdir()
    (week / "Dutch_Auth_Summary.xlsx").write_bytes(b"PK")
    (week / "Dutch_Interchange.xlsx").write_bytes(b"PK")
    found = discover_weeks(tmp_path)
    assert len(found) == 1
    assert found[0]["week_start"] == "2026-08-03"
    assert "Auth" in found[0]["auth"].name or "auth" in found[0]["auth"].name.lower()
