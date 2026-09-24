from pathlib import Path

from nso_reminders.templates import render_email


def test_render_replaces_placeholders(tmp_path: Path):
    (tmp_path / "seal_verification.md").write_text(
        "Subject: Hello {{newco_id}}\n\nBody {{city}}\n", encoding="utf-8"
    )
    subject, body = render_email(
        "seal_verification",
        {
            "newco_id": "CA2908",
            "city": "Fresno",
            "state": "CA",
            "operator_names": "Codi",
            "projected_opening": "2026-08-21",
            "status": "Seal Verification",
        },
        tmp_path,
    )
    assert subject == "Hello CA2908"
    assert "Fresno" in body
