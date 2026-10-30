from __future__ import annotations

import shutil
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
    assert any("iTrac" in note for note in payload["notes"])
    by_id = {shop["id"]: shop for shop in payload["shops"]}
    assert by_id["IL1504"]["opening_date"] == "2026-12-22"
    assert by_id["IL1504"]["stratix_to_shop"] == "Not shipped"
    assert by_id["IL1504"]["first_tamper_check"] == "No Devices"
    # AZ0104 shipped 10/20 and was delivered 10/21. It read "Not shipped" while
    # a one-shop PO extract let the pipeline fall back to a 12-day-old scrape.
    assert by_id["AZ0104"]["opening_date"] == "2026-10-30"
    assert by_id["AZ0104"]["first_tamper_check"] == "Completed"
    assert by_id["AZ0104"]["stratix_to_shop"] == "Delivered"
    statuses = {shop["verifone_to_stratix"] for shop in payload["shops"]}
    assert statuses <= {"Delivered", "In transit", "Not delivered"}
    assert {shop["stratix_to_shop"] for shop in payload["shops"]} <= {
        "Not shipped",
        "Shipped and in transit",
        "Delivered",
    }


def test_a_partial_scrape_does_not_claim_to_date_the_whole_pipeline(tmp_path: Path):
    """A one-shop PO scrape once let 12-day-old shipment dates publish unnoticed.

    The newest file still refreshes the shops it lists, but the source line has
    to name the scrape that carries the rest of the pipeline.
    """
    raw = ROOT / "data" / "raw" / "payment-devices"
    full = raw / "PO_Extract_101626_1032.xlsx"
    partial = raw / "PO_Extract_102826_1251.xlsx"
    orders = raw / "Daily Dutch Bros Booked Shipped Orders Report2026-10-28-06-33-11.xlsx"
    for source in (full, partial, orders):
        shutil.copy(source, tmp_path / source.name)

    payload = nso.build_payload(tmp_path)
    sources = payload["sources"]
    assert len(nso.read_po_rows(partial)) < nso.devices.FULL_PO_MIN_SHOPS
    assert sources["po_extracts"][-1] == partial.name
    assert sources["po_basis"] == full.name
    assert sources["po_basis_date"] == "2026-10-16"


def test_published_nso_health_matches_the_extracts():
    assert nso.main(["--check"]) == 0
