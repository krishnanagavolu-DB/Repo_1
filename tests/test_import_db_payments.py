from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_db_payments as dbpay  # noqa: E402


def _update(week: str, **extra) -> dict:
    return {
        "week_start": week,
        "summary": "Shipped the week of data.",
        "items": [{"area": "Card Health", "status": "done", "text": "Published week of Oct 12."}],
        "next": ["Load Oct 19."],
        "asks": [],
        **extra,
    }


def test_updates_publish_newest_first(tmp_path: Path):
    (tmp_path / "db_payments_update_20261012.json").write_text(json.dumps(_update("2026-10-12")))
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(_update("2026-10-19")))
    payload = json.loads(dbpay.build(tmp_path))
    assert payload["latest_week"] == "2026-10-19"
    assert [item["week_start"] for item in payload["updates"]] == ["2026-10-19", "2026-10-12"]


def test_empty_folder_publishes_no_updates(tmp_path: Path):
    payload = json.loads(dbpay.build(tmp_path))
    assert payload["updates"] == []
    assert payload["latest_week"] is None


def test_week_must_match_filename_monday(tmp_path: Path):
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(_update("2026-10-12")))
    try:
        dbpay.build(tmp_path)
    except ValueError as err:
        assert "must be 2026-10-19" in str(err)
    else:
        raise AssertionError("mismatched week_start was accepted")


def test_item_status_is_checked(tmp_path: Path):
    bad = _update("2026-10-19", items=[{"status": "maybe", "text": "x"}])
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(bad))
    try:
        dbpay.build(tmp_path)
    except ValueError as err:
        assert "status must be one of" in str(err)
    else:
        raise AssertionError("unknown status was accepted")


def test_project_status_is_checked(tmp_path: Path):
    bad = _update("2026-10-19", projects=[{"name": "X", "status": "Maybe", "this_week": "y"}])
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(bad))
    try:
        dbpay.build(tmp_path)
    except ValueError as err:
        assert "projects[0] status must be one of" in str(err)
    else:
        raise AssertionError("unknown project status was accepted")


def test_top_priorities_are_capped_at_three(tmp_path: Path):
    bad = _update("2026-10-19", top_priorities=["a", "b", "c", "d"])
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(bad))
    try:
        dbpay.build(tmp_path)
    except ValueError as err:
        assert "top_priorities must be up to three" in str(err)
    else:
        raise AssertionError("four priorities were accepted")


def test_closed_project_is_kept_in_the_record(tmp_path: Path):
    good = _update(
        "2026-10-19",
        projects=[{"name": "Retired", "status": "Closed", "this_week": "Wrapped up."}],
        action_items=[{"owner": "Ravi", "text": "Confirm the handoff."}],
    )
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(good))
    payload = json.loads(dbpay.build(tmp_path))
    assert payload["updates"][0]["projects"][0]["status"] == "Closed"


def test_action_owner_is_limited_to_krishna_or_ravi(tmp_path: Path):
    bad = _update("2026-10-19", action_items=[{"owner": "Shubha", "text": "Decide."}])
    (tmp_path / "db_payments_update_20261019.json").write_text(json.dumps(bad))
    try:
        dbpay.build(tmp_path)
    except ValueError as err:
        assert "owner must be one of" in str(err)
    else:
        raise AssertionError("an unknown owner was accepted")


def test_published_updates_match_raw_folder():
    assert dbpay.main(["--check"]) == 0
