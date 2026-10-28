from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_nso_health as nso  # noqa: E402


def test_stratix_hop_uses_po_ship_and_delivery_dates():
    as_of = date(2026, 10, 16)
    assert nso.stratix_to_shop(None, None, as_of) == "Not shipped"
    assert nso.stratix_to_shop(date(2026, 10, 14), None, as_of) == "Shipped and in transit"
    assert nso.stratix_to_shop(date(2026, 10, 14), date(2026, 10, 20), as_of) == "Shipped and in transit"
    assert nso.stratix_to_shop(date(2026, 10, 14), date(2026, 10, 15), as_of) == "Delivered"


def test_verifone_hop_uses_the_orders_report_until_itraq_arrives():
    assert nso.verifone_to_stratix(True, False) == "Delivered"
    assert nso.verifone_to_stratix(False, True) == "In transit"
    assert nso.verifone_to_stratix(False, False) == "Not delivered"


def test_current_extracts_keep_tamper_status_and_name_the_itraq_gap():
    payload = nso.build_payload()
    assert payload["sources"]["itraq"] is None
    assert any("iTraq" in note for note in payload["notes"])
    by_id = {shop["id"]: shop for shop in payload["shops"]}
    assert by_id["IL1504"]["opening_date"] == "2026-12-22"
    assert by_id["IL1504"]["stratix_to_shop"] == "Not shipped"
    assert by_id["IL1504"]["first_tamper_check"] == "No Devices"
    assert by_id["FL2501"]["opening_date"] == "2026-10-19"
    assert by_id["FL2501"]["first_tamper_check"] == "Completed"
    assert by_id["FL2501"]["stratix_to_shop"] == "Delivered"
    statuses = {shop["verifone_to_stratix"] for shop in payload["shops"]}
    assert statuses <= {"Delivered", "In transit", "Not delivered"}
    assert {shop["stratix_to_shop"] for shop in payload["shops"]} <= {
        "Not shipped",
        "Shipped and in transit",
        "Delivered",
    }


def test_published_nso_health_matches_the_extracts():
    assert nso.main(["--check"]) == 0
