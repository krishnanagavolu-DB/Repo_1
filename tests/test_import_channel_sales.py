"""The channel split must reconcile to the published total or not publish."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from import_channel_sales import (  # noqa: E402
    DRIFT_RATIO,
    apply_channels,
    bucket_for,
    check_published,
    group_rows,
    main,
    read_rows,
)

PROCESSED = ROOT / "data" / "processed" / "in_shop_sales_data.json"


def _payload(sales: float = 1000.0, orders: int = 100) -> dict:
    return {
        "weeks": [
            {
                "week_start_date": "2026-09-14",
                "totals": {"SALES_VOLUME": sales, "ORDER_COUNT": orders},
            }
        ]
    }


def _rows(in_shop=840.0, ahead=158.0, other=2.0, orders=(84, 15, 1)):
    return [
        {"WEEK_START_DATE": "2026-09-14", "CHANNEL": "Drive-Thru", "SALES_VOLUME": in_shop, "ORDER_COUNT": orders[0]},
        {"WEEK_START_DATE": "2026-09-14", "CHANNEL": "Order Ahead", "SALES_VOLUME": ahead, "ORDER_COUNT": orders[1]},
        {"WEEK_START_DATE": "2026-09-14", "CHANNEL": "DoorDash", "SALES_VOLUME": other, "ORDER_COUNT": orders[2]},
    ]


def test_drive_thru_and_walk_up_are_one_in_shop_channel():
    assert bucket_for("Drive-Thru") == "In shop"
    assert bucket_for("Walk-Up") == "In shop"
    assert bucket_for("Order Ahead") == "Order ahead"


def test_unknown_channels_roll_into_other_rather_than_disappearing():
    assert bucket_for("DoorDash") == "Other / delivery"
    assert bucket_for("Uber Eats") == "Other / delivery"
    assert bucket_for("") == "Other / delivery"


def test_drive_thru_and_walk_up_sum_into_a_single_segment():
    rows = _rows()
    rows.append(
        {"WEEK_START_DATE": "2026-09-14", "CHANNEL": "Walk-Up", "SALES_VOLUME": 10.0, "ORDER_COUNT": 1}
    )
    grouped = group_rows(rows)
    assert grouped["2026-09-14"]["In shop"]["sales"] == 850.0


def test_reconciling_rows_are_applied():
    payload = _payload()
    applied, problems = apply_channels(payload, group_rows(_rows()))
    assert problems == []
    assert applied == 1
    channels = payload["weeks"][0]["channels"]
    assert [row["label"] for row in channels] == ["In shop", "Order ahead", "Other / delivery"]
    assert round(sum(row["sales"] for row in channels), 2) == 1000.0


def test_settlement_drift_is_scaled_back_onto_the_segments():
    """A channel query run after the POS extract sees a few late transactions."""
    payload = _payload(sales=1_000_000.0, orders=100_000)
    rows = _rows(in_shop=840_002.0, ahead=158_000.0, other=2_000.0, orders=(84_001, 15_000, 1_000))
    applied, problems = apply_channels(payload, group_rows(rows))
    assert problems == []
    assert applied == 1
    week = payload["weeks"][0]
    assert round(sum(row["sales"] for row in week["channels"]), 2) == 1_000_000.0
    assert sum(row["orders"] for row in week["channels"]) == 100_000
    assert week["channel_reconciliation"]["sales_drift"] == 2.0


def test_drift_beyond_settlement_size_is_refused():
    """A whole missing channel is far past drift and must not be smoothed away."""
    payload = _payload(sales=1_000_000.0, orders=100_000)
    over = 1_000_000.0 * DRIFT_RATIO * 10
    rows = _rows(in_shop=840_000.0 + over, ahead=158_000.0, other=2_000.0, orders=(84_000, 15_000, 1_000))
    applied, problems = apply_channels(payload, group_rows(rows))
    assert applied == 0
    assert any("beyond settlement drift" in item for item in problems)
    assert "channels" not in payload["weeks"][0]


def test_an_exact_week_records_no_adjustment():
    payload = _payload()
    apply_channels(payload, group_rows(_rows()))
    assert "channel_reconciliation" not in payload["weeks"][0]


def test_sales_that_miss_the_published_total_are_refused():
    payload = _payload()
    applied, problems = apply_channels(payload, group_rows(_rows(in_shop=800.0)))
    assert applied == 0
    assert any("differ from published" in item or "!= published" in item for item in problems)
    assert "channels" not in payload["weeks"][0]


def test_order_counts_that_miss_the_published_total_are_refused():
    payload = _payload()
    applied, problems = apply_channels(payload, group_rows(_rows(orders=(84, 15, 40))))
    assert applied == 0
    assert any("orders" in item for item in problems)


def test_rows_for_an_unpublished_week_are_reported():
    payload = _payload()
    rows = _rows()
    rows[0] = {**rows[0], "WEEK_START_DATE": "2026-09-21"}
    _applied, problems = apply_channels(payload, group_rows(rows))
    assert any("not published" in item for item in problems)


def test_csv_and_json_inputs_read_the_same(tmp_path: Path):
    json_path = tmp_path / "channels.json"
    json_path.write_text(json.dumps(_rows()), encoding="utf-8")
    csv_path = tmp_path / "channels.csv"
    csv_path.write_text(
        "WEEK_START_DATE,CHANNEL,SALES_VOLUME,ORDER_COUNT\n"
        "2026-09-14,Drive-Thru,840.0,84\n"
        "2026-09-14,Order Ahead,158.0,15\n"
        "2026-09-14,DoorDash,2.0,1\n",
        encoding="utf-8",
    )
    assert group_rows(read_rows(json_path)) == group_rows(read_rows(csv_path))


def test_cli_refuses_to_write_when_a_week_does_not_reconcile(tmp_path: Path):
    processed = tmp_path / "in_shop_sales_data.json"
    processed.write_text(json.dumps(_payload()), encoding="utf-8")
    source = tmp_path / "channels.json"
    source.write_text(json.dumps(_rows(in_shop=500.0)), encoding="utf-8")

    before = processed.read_text(encoding="utf-8")
    assert main([str(source), "--processed", str(processed)]) == 1
    assert processed.read_text(encoding="utf-8") == before


def test_cli_writes_reconciling_rows(tmp_path: Path):
    processed = tmp_path / "in_shop_sales_data.json"
    processed.write_text(json.dumps(_payload()), encoding="utf-8")
    source = tmp_path / "channels.json"
    source.write_text(json.dumps(_rows()), encoding="utf-8")

    assert main([str(source), "--processed", str(processed)]) == 0
    written = json.loads(processed.read_text(encoding="utf-8"))
    assert len(written["weeks"][0]["channels"]) == 3


def test_published_pos_channel_rows_reconcile():
    """Guards the real file: channels, once present, must add to the total."""
    payload = json.loads(PROCESSED.read_text(encoding="utf-8"))
    assert check_published(payload) == []
