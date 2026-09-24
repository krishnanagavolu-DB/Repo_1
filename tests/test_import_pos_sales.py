"""Weekly POS extracts carry a rolling window, so importing must accumulate weeks.

A Snowflake export holds only the most recent weeks. Copying one over the
published file silently drops every older week from the trend, which is how
All payments went from five weeks to two.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from import_pos_sales import combine_extracts, validate  # noqa: E402

DEFINITIONS = {
    "SALES_VOLUME": "Company Owned payment dollars from Gold Semantic Sales.",
    "Card": "ORDER_PAYMENT_TYPE_FORM = CREDIT",
}
METHODOLOGY = {"title": "In-shop sales — data notes"}
TENDER_ORDER = ["Card", "Cash", "Gift Card / Dutch Pass"]


def _week(week_start: str, *, sales: float = 1000.0, card: float = 700.0) -> dict:
    return {
        "week_start_date": week_start,
        "week_end_date": week_start,
        "totals": {"SALES_VOLUME": sales, "TRANSACTION_COUNT": 100, "ORDER_COUNT": 90},
        "tender_mix": {
            "Card": {"amount": card, "pct_of_total_sales": 70.0, "TRANSACTION_COUNT": 70},
            "Cash": {"amount": sales - card - 100.0, "pct_of_total_sales": 20.0, "TRANSACTION_COUNT": 20},
            "Gift Card / Dutch Pass": {
                "amount": 100.0,
                "pct_of_total_sales": 10.0,
                "TRANSACTION_COUNT": 10,
            },
        },
    }


def _extract(generated_at: str, weeks: list[dict], **overrides) -> dict:
    payload = {
        "generated_at": generated_at,
        "week_cadence": "Monday-Sunday",
        "environment": "prod",
        "definitions": DEFINITIONS,
        "methodology": METHODOLOGY,
        "tender_order": TENDER_ORDER,
        "weeks": weeks,
        "shop_coverage": {"co_shops_in_gold_dim": 1016},
    }
    payload.update(overrides)
    return payload


def _write(path: Path, payload: dict) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def test_combines_weeks_across_extracts(tmp_path: Path):
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract("2026-08-31T00:00:00-07:00", [_week("2026-08-17"), _week("2026-08-24")]),
    )
    newer = _write(
        tmp_path / "in_shop_sales_data_20260921.json",
        _extract("2026-09-21T00:00:00-07:00", [_week("2026-09-07"), _week("2026-09-14")]),
    )

    combined, _warnings = combine_extracts([older, newer])

    assert [w["week_start_date"] for w in combined["weeks"]] == [
        "2026-08-17",
        "2026-08-24",
        "2026-09-07",
        "2026-09-14",
    ]


def test_orders_weeks_regardless_of_input_order(tmp_path: Path):
    newer = _write(
        tmp_path / "in_shop_sales_data_20260921.json",
        _extract("2026-09-21T00:00:00-07:00", [_week("2026-09-07")]),
    )
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract("2026-08-31T00:00:00-07:00", [_week("2026-08-24")]),
    )

    combined, _warnings = combine_extracts([newer, older])

    assert [w["week_start_date"] for w in combined["weeks"]] == ["2026-08-24", "2026-09-07"]


def test_newest_extract_wins_when_a_week_is_restated(tmp_path: Path):
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract("2026-08-31T00:00:00-07:00", [_week("2026-08-24", sales=1000.0)]),
    )
    newer = _write(
        tmp_path / "in_shop_sales_data_20260921.json",
        _extract("2026-09-21T00:00:00-07:00", [_week("2026-08-24", sales=2500.0)]),
    )

    combined, warnings = combine_extracts([older, newer])

    assert len(combined["weeks"]) == 1
    assert combined["weeks"][0]["totals"]["SALES_VOLUME"] == 2500.0
    assert any("restated" in w for w in warnings)


def test_root_metadata_comes_from_the_newest_extract(tmp_path: Path):
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract(
            "2026-08-31T00:00:00-07:00",
            [_week("2026-08-24")],
            shop_coverage={"co_shops_in_gold_dim": 1016, "franchised_shops_in_gold_dim": 310},
        ),
    )
    newer = _write(
        tmp_path / "in_shop_sales_data_20260921.json",
        _extract(
            "2026-09-21T00:00:00-07:00",
            [_week("2026-09-07")],
            shop_coverage={"co_shops_in_gold_dim": 1016, "franchised_shops_in_gold_dim": 312},
        ),
    )

    combined, _warnings = combine_extracts([older, newer])

    assert combined["shop_coverage"]["franchised_shops_in_gold_dim"] == 312
    assert combined["generated_at"] == "2026-09-21T00:00:00-07:00"


def test_rejects_extracts_with_different_definitions(tmp_path: Path):
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract("2026-08-31T00:00:00-07:00", [_week("2026-08-24")]),
    )
    drifted = _extract("2026-09-21T00:00:00-07:00", [_week("2026-09-07")])
    drifted["definitions"] = {**DEFINITIONS, "SALES_VOLUME": "Now excludes something else."}
    newer = _write(tmp_path / "in_shop_sales_data_20260921.json", drifted)

    with pytest.raises(ValueError, match=r"(?i)definitions|metadata|diverg"):
        combine_extracts([older, newer])


def test_warns_about_a_missing_week_instead_of_hiding_it(tmp_path: Path):
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract("2026-08-31T00:00:00-07:00", [_week("2026-08-24")]),
    )
    newer = _write(
        tmp_path / "in_shop_sales_data_20260921.json",
        _extract("2026-09-21T00:00:00-07:00", [_week("2026-09-07")]),
    )

    _combined, warnings = combine_extracts([older, newer])

    assert any("2026-08-31" in w for w in warnings)


def test_combined_payload_still_passes_validation(tmp_path: Path):
    older = _write(
        tmp_path / "in_shop_sales_data_20260831.json",
        _extract("2026-08-31T00:00:00-07:00", [_week("2026-08-24")]),
    )
    newer = _write(
        tmp_path / "in_shop_sales_data_20260921.json",
        _extract("2026-09-21T00:00:00-07:00", [_week("2026-08-31"), _week("2026-09-07")]),
    )

    combined, _warnings = combine_extracts([older, newer])
    errors, _validation_warnings = validate(combined)

    assert errors == []


def test_published_file_keeps_every_certified_week():
    """The live trend must not shrink when a rolling extract lands."""
    raw_dir = ROOT / "data" / "raw" / "pos-sales"
    extracts = sorted(raw_dir.glob("in_shop_sales_data_*.json"))
    assert extracts, "weekly POS extracts must be kept for lineage"

    combined, _warnings = combine_extracts(extracts)
    expected = [w["week_start_date"] for w in combined["weeks"]]

    processed = ROOT / "data" / "processed" / "in_shop_sales_data.json"
    payload = json.loads(processed.read_text(encoding="utf-8"))
    assert [w["week_start_date"] for w in payload["weeks"]] == expected, (
        f"{processed.relative_to(ROOT)} is missing weeks held in data/raw/pos-sales. "
        "Re-run scripts/import_pos_sales.py with every extract."
    )
