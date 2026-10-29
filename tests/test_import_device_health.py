"""The preview terminals card reads the Device Health workbook, not a recount."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_device_health as health  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def test_workbook_locations_add_up_and_stay_off_the_purchase_order():
    payload = health.build_payload(ROOT / "data" / "raw" / "device-health")
    row = payload["e285"]
    assert row["in_shops"] + row["at_stratix"] + row["location_not_confirmed"] == row["total"]
    assert row["spare_pool"] + row["depot"] + row["awaiting_nso"] + row["held_for_opening"] == row["at_stratix"]
    assert row["in_shops_active"] + row["in_shops_inactive"] == row["in_shops"]
    assert row["available_to_ship"] + row["not_available"] == row["at_stratix"]
    assert row["total"] == 18085
    assert row["at_stratix"] == 3202
    assert row["awaiting_nso"] == 1072
    assert row["held_for_opening"] == 9
    assert row["spare_pool_available"] == 401
    assert row["available_to_ship"] == 1700
    assert payload["as_of"] == "2026-10-29"
    assert payload["vhq_as_of"] == "2026-10-26"
    assert payload["itrac_as_of"] == "2026-10-28"
    assert payload["source"] == "Device_Health_2026-10-29.xlsx"
    assert "purchase order" in payload["note"]
    assert "remaining" not in row
