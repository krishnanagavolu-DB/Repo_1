from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path

from openpyxl import Workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_payment_devices as devices  # noqa: E402


def _write_po(path: Path, rows: list[tuple]) -> None:
    wb = Workbook()
    ws = wb.active
    ws.title = "PO"
    ws.append(["ignore", "this header banner"])
    ws.append(["NewCo ID", "Projected Opening Date", "Notes"])
    for row in rows:
        ws.append(list(row))
    wb.save(path)
    wb.close()


def _write_orders(path: Path, booked: list[str], shipped: list[str]) -> None:
    wb = Workbook()
    booked_ws = wb.active
    booked_ws.title = "Booked Orders"
    booked_ws.append(["Daily Dutch Bros Booked Shipped Orders Report"])
    booked_ws.append(["End Customer Name", "Order"])
    for shop in booked:
        booked_ws.append([shop, "booked"])
    shipped_ws = wb.create_sheet("Shipped Orders")
    shipped_ws.append(["metadata row one"])
    shipped_ws.append(["End Customer Name", "Ship Date"])
    for shop in shipped:
        shipped_ws.append([shop, "2026-09-01"])
    wb.save(path)
    wb.close()


def test_vendor_text_parses_balance_and_date():
    balance, as_of = devices.parse_vendor_text("Remaining balance: 3770\nDate: 2026-09-16\n")
    assert balance == 3770
    assert as_of == date(2026, 9, 16)


def test_exact_newco_match_filters_shipped_shops(tmp_path: Path):
    po = tmp_path / "PO_Extract_2026-09-16.xlsx"
    orders = tmp_path / "Daily Dutch Bros Booked Shipped Orders Report20260916.xlsx"
    _write_po(
        po,
        [
            ("AL0107", date(2026, 10, 1)),
            ("CA2909", date(2026, 11, 1)),
            ("KS0406", date(2026, 12, 1)),
        ],
    )
    _write_orders(orders, booked=["AZ0533", "KS0406"], shipped=["AZ0533", "KS0406"])
    shops = devices.parse_po_extract(po)
    shipped = set(devices.parse_customer_ids(orders, "Shipped Orders", 1))
    remaining = devices.unfulfilled_shops(shops, shipped)
    assert {shop["id"] for shop in remaining} == {"AL0107", "CA2909"}
    assert "KS0406" not in {shop["id"] for shop in remaining}


def test_pipeline_burns_ten_devices_per_unfulfilled_shop():
    unfulfilled = [
        {"id": "AL0107", "opening_date": date(2026, 10, 1)},
        {"id": "CA2909", "opening_date": date(2026, 10, 1)},
        {"id": "TN0703", "opening_date": date(2026, 11, 1)},
    ]
    po = unfulfilled + [{"id": "KS0406", "opening_date": date(2026, 12, 1)}]
    result = devices.project_burndown(3770, date(2026, 9, 16), unfulfilled, po)
    # 3 unfulfilled shops × 10 devices = 30, so pipeline ends at 3740
    assert result["pipeline_end_inventory"] == 3740
    oct_points = [p for p in result["pipeline"] if p["date"] == "2026-10-01"]
    assert oct_points[-1]["inventory"] == 3750
    nov_points = [p for p in result["pipeline"] if p["date"] == "2026-11-01"]
    assert nov_points[-1]["inventory"] == 3740
    # latest PO date is Dec 1 even though that shop already shipped
    assert result["pipeline_end_date"] == date(2026, 12, 1)


def test_run_rate_uses_five_point_five_shops_per_week():
    result = devices.project_burndown(55, date(2026, 9, 16), [], [])
    assert result["runRate"][0]["inventory"] == 55
    assert result["zero_date"] == date(2026, 9, 23)
    assert result["runRate"][-1]["inventory"] == 0


def test_threshold_crossing_interpolates_run_rate():
    pipeline = [{"date": "2026-09-16", "inventory": 2600, "series": "pipeline"}]
    run_rate = [
        {"date": "2026-09-16", "inventory": 2600, "series": "runRate"},
        {"date": "2026-09-23", "inventory": 2545, "series": "runRate"},
        {"date": "2026-09-30", "inventory": 2490, "series": "runRate"},
    ]
    rows = devices.crossings_for(pipeline, run_rate)
    hit = next(item for item in rows if item["threshold"] == 2500)
    assert hit["label"].endswith("2026")
    assert hit["date"] >= "2026-09-23"
    assert hit["date"] <= "2026-09-30"


def test_latest_file_prefers_newer_date_in_name(tmp_path: Path):
    older = tmp_path / "PO_Extract_2026-09-01.xlsx"
    newer = tmp_path / "PO_Extract_2026-09-16.xlsx"
    older.write_bytes(b"old")
    newer.write_bytes(b"new")
    assert devices.latest_file(tmp_path, devices.PO_NAME) == newer


def test_cli_builds_certified_payload(tmp_path: Path, monkeypatch):
    raw = tmp_path / "raw"
    raw.mkdir()
    (raw / "vendor_inventory.txt").write_text("Remaining balance: 3,770\nDate: 2026-09-16\n")
    _write_po(
        raw / "PO_Extract_20260916.xlsx",
        [
            ("AL0107", date(2026, 10, 1)),
            ("CA2909", date(2026, 11, 15)),
            ("KS0406", date(2026, 12, 1)),
        ],
    )
    _write_orders(
        raw / "Daily Dutch Bros Booked Shipped Orders Report20260916.xlsx",
        booked=["KS0406"],
        shipped=["KS0406"],
    )
    out = tmp_path / "payment_devices.json"
    assert devices.main(["--raw", str(raw), "--out", str(out)]) == 0
    payload = json.loads(out.read_text())
    assert payload["certified"] is True
    assert payload["summary"]["starting_inventory"] == 3770
    assert payload["summary"]["po_pipeline_shops"] == 3
    assert payload["summary"]["shipped_shops"] == 1
    assert payload["summary"]["unfulfilled_shops"] == 2
    assert payload["summary"]["pipeline_end_inventory"] == 3750
    assert payload["series"]["pipeline"]
    assert payload["series"]["runRate"][-1]["inventory"] == 0
    assert {row["threshold"] for row in payload["crossings"]} >= {3000, 2500, 1000}


def test_missing_sources_do_not_invent_numbers(tmp_path: Path):
    payload = devices.build_payload(tmp_path)
    assert payload["certified"] is False
    assert payload["status"] == "awaiting_sources"
    assert payload["summary"] is None
    assert payload["series"]["pipeline"] == []
