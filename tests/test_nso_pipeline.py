import json
from datetime import date
from pathlib import Path

from nso_reminders.pipeline import run_dry_run
from nso_reminders.config import load_nso_config


FIXTURES = Path(__file__).parent / "fixtures" / "nso"


def test_dry_run_pipeline(tmp_path: Path):
    summary = run_dry_run(
        grid_path=FIXTURES / "sample_grid.xlsx",
        send_log_path=FIXTURES / "sample_send_log.xlsx",
        cache_path=FIXTURES / "sample_email_cache.xlsx",
        out_dir=tmp_path,
        today=date(2026, 8, 17),
        config=load_nso_config(),
    )
    by_id = {d["newco_id"]: d for d in summary["decisions"]}
    assert by_id["SC0701"]["action"] == "none"
    assert by_id["CA2908"]["action"] == "draft_1"
    assert by_id["IA0102"]["action"] == "exception"
    assert by_id["IA0102"]["exception_type"] == "no_devices"

    assert summary["report_path"].exists()
    previews = {p["newco_id"]: p for p in summary["draft_previews"]}
    assert "CA2908" in previews
    assert "kyle@example.com" in previews["CA2908"]["to"]
    assert "REPLACE ME" in previews["CA2908"]["subject"]

    preview_file = tmp_path / "draft_previews.json"
    assert preview_file.exists()
    data = json.loads(preview_file.read_text(encoding="utf-8"))
    assert any(item["newco_id"] == "CA2908" for item in data)
