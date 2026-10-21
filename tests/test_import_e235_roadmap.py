from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_e235_roadmap as roadmap  # noqa: E402


def _baseline() -> dict:
    return json.loads((roadmap.RAW_DIR / "e235_roadmap_20261021.json").read_text(encoding="utf-8"))


def test_baseline_pdf_drop_is_valid_and_has_five_stages():
    payload = _baseline()
    assert roadmap.validate(payload, "baseline") == []
    assert [stage["name"] for stage in payload["stages"]] == [
        "Lab / Dev",
        "Pre-prod",
        "Field test",
        "Field pilot",
        "Rollout",
    ]
    current = [stage for stage in payload["stages"] if stage["status"] == "current"]
    assert [stage["name"] for stage in current] == ["Pre-prod"]
    assert len(payload["assumptions"]) == 9
    assert len(payload["open_questions"]) == 5


def test_newest_dated_drop_wins(tmp_path: Path):
    older = _baseline()
    newer = _baseline() | {"as_of": "2026-10-28"}
    (tmp_path / "e235_roadmap_20261021.json").write_text(json.dumps(older))
    (tmp_path / "e235_roadmap_20261028.json").write_text(json.dumps(newer))
    rendered, source = roadmap.build(tmp_path)
    assert source.name == "e235_roadmap_20261028.json"
    assert json.loads(rendered)["as_of"] == "2026-10-28"


def test_exactly_one_current_stage_is_required():
    payload = _baseline()
    payload["stages"][2]["status"] = "current"
    assert any("exactly one stage" in error for error in roadmap.validate(payload, "x"))


def test_unknown_status_is_rejected():
    payload = _baseline()
    payload["stages"][4]["status"] = "someday"
    assert any("status must be one of" in error for error in roadmap.validate(payload, "x"))


def test_published_roadmap_matches_newest_raw_drop():
    assert roadmap.main(["--check"]) == 0
