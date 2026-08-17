from pathlib import Path

from nso_reminders.operators import (
    load_email_cache,
    resolve_from_cache,
    save_email_cache,
    split_operator_names,
)


def test_split_operator_names_on_commas():
    assert split_operator_names("Kyle Radosevich, Natalie Example") == [
        "Kyle Radosevich",
        "Natalie Example",
    ]
    assert split_operator_names("Codi Crain") == ["Codi Crain"]
    assert split_operator_names("") == []


def test_cache_roundtrip(tmp_path: Path):
    path = tmp_path / "PO_Operator_Email_Cache.xlsx"
    save_email_cache(path, {"codi crain": "codi@example.com"})
    loaded = load_email_cache(path)
    assert loaded["codi crain"] == "codi@example.com"


def test_resolve_partial():
    cache = {"kyle radosevich": "kyle@example.com"}
    emails, missing = resolve_from_cache(
        ["Kyle Radosevich", "Natalie Example"], cache
    )
    assert emails == ["kyle@example.com"]
    assert missing == ["Natalie Example"]
