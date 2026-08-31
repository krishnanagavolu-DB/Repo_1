"""Tests for the company-owned-only Olo Pay weekly importer."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path

import pytest

from scripts.import_olo_pay import combine_weekly_files, validate_week

BRAND_ORDER = ["Visa", "Mastercard", "Amex", "Discover"]


def _monday(d: str) -> date:
    return date.fromisoformat(d)


def _week_payload(
    week_start: str = "2026-08-24",
    *,
    sales: float = 1000.0,
    txn: int = 100,
    orders: int | None = None,
    avg_ticket: float | None = None,
    approved: int | None = None,
    declined: int = 4,
    failed: int = 0,
    auth_rate: float | None = None,
    brands: dict | None = None,
    franchised: float = 0.0,
    unmapped: float = 0.0,
    processor: str = "Stripe",
    shop_filter: str = (
        "Company Owned via GOLD_SEMANTIC.SALES.VW_DIM_STORE_CURATED.OWNERSHIP. "
        "Franchised and unmapped excluded."
    ),
    week_end: str | None = None,
    extra_weeks: list[dict] | None = None,
    mix_checksum: float = 100.0,
) -> dict:
    start = _monday(week_start)
    end = week_end or (start + timedelta(days=6)).isoformat()
    orders = txn if orders is None else orders
    approved = txn if approved is None else approved
    if avg_ticket is None:
        avg_ticket = round(sales / orders, 2) if orders else 0.0
    attempts = approved + declined + failed
    if auth_rate is None:
        auth_rate = round(approved / attempts * 100, 2) if attempts else 0.0

    if brands is None:
        # Split evenly enough to reconcile; put remainder on Visa.
        per_amt = round(sales / 4, 2)
        amounts = [per_amt, per_amt, per_amt, round(sales - 3 * per_amt, 2)]
        per_cnt = txn // 4
        counts = [per_cnt, per_cnt, per_cnt, txn - 3 * per_cnt]
        pcts = [25.0, 25.0, 25.0, 25.0]
        brands = {
            name: {
                "amount": amounts[i],
                "pct_of_digital_sales": pcts[i],
                "TRANSACTION_COUNT": counts[i],
            }
            for i, name in enumerate(BRAND_ORDER)
        }

    week = {
        "week_start_date": week_start,
        "week_end_date": end,
        "totals": {
            "SALES_VOLUME": sales,
            "TRANSACTION_COUNT": txn,
            "ORDER_COUNT": orders,
            "AVG_TICKET": avg_ticket,
            "AVG_TICKET_BASIS": "distinct_ORDER_ID",
            "REFUND_VOLUME": 1.0,
            "VOID_VOLUME": 0.5,
        },
        "authorization": {
            "approved": approved,
            "declined": declined,
            "failed": failed,
            "auth_rate_pct": auth_rate,
            "basis": "Sale attempts with STATUS in Approved, Declined, Failure",
        },
        "card_brand_mix": brands,
        "mix_checksum": mix_checksum,
        "ownership_split": {
            "company_owned_sales": sales,
            "franchised_sales": franchised,
            "unmapped_or_other_sales": unmapped,
        },
        "week_over_week": {
            "SALES_VOLUME_PCT": -1.0,
            "TRANSACTION_COUNT_PCT": -1.0,
            "AUTH_RATE_PP": 0.0,
        },
    }
    weeks = [week]
    if extra_weeks:
        weeks.extend(extra_weeks)

    return {
        "generated_at": "2026-08-31T15:15:25-07:00",
        "week_cadence": "Monday-Sunday",
        "dashboard_tab": "Olo Pay",
        "environment": "prod",
        "definitions": {
            "SALES_VOLUME": "Approved Stripe Sale dollars at Company Owned shops.",
            "AUTHORIZATION_RATE": "Approved vs Declined or Failure on Sale attempts.",
            "CARD_BRAND_MIX": "Base card network from ACCOUNT_ISSUER.",
        },
        "methodology_file": "olo_pay_methodology.json",
        "filter": {
            "layer": "OLO_DATA_SHARE.RPT_EXT.BILLING_TRANSACTION_FCT_V",
            "processor": processor,
            "txn_types": ["Sale", "RefundSale", "VoidSale"],
            "sales_status": "Approved",
            "shop_filter": shop_filter,
        },
        "brand_order": list(BRAND_ORDER),
        "weeks": weeks,
        "shop_coverage": {
            "gold_store_ownership_counts": {
                "Company Owned": 1016,
                "Franchised": 310,
            }
        },
        "artifacts": {
            "json": f"olo_pay_data_{week_start.replace('-', '')}.json",
            "methodology": "olo_pay_methodology.json",
        },
        "error_log": [
            {
                "code": "dedupe_billing_transaction_id",
                "source_rows_after_dedupe": 5_671_507,
                "distinct_id": 5_671_507,
                "null_amount": 0,
            }
        ],
    }


def _methodology() -> dict:
    return {
        "title": "Olo Pay — data notes",
        "dashboard_tab": "Olo Pay",
        "phase": 1,
        "kpi_definitions": {
            "SALES_VOLUME": "Approved Stripe Sale dollars at Company Owned shops.",
            "AUTHORIZATION_RATE": "Approved vs Declined or Failure.",
            "CARD_BRAND_MIX": "Base card network from ACCOUNT_ISSUER.",
        },
    }


def _write_week(path: Path, payload: dict) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _error_codes(errors: list[dict]) -> set[str]:
    return {e.get("code", "") for e in errors}


def test_validate_week_accepts_valid_co_only_payload():
    payload = _week_payload("2026-08-24")
    errors = validate_week(payload, "2026-08-24")
    assert errors == []


def test_combine_valid_weeks_chronologically_source_derived(tmp_path: Path):
    methodology = _methodology()
    starts = [
        "2026-06-15",
        "2026-06-22",
        "2026-06-29",
        "2026-07-06",
        "2026-07-13",
        "2026-07-20",
        "2026-07-27",
        "2026-08-03",
        "2026-08-10",
        "2026-08-17",
        "2026-08-24",
    ]
    paths = []
    for i, start in enumerate(starts):
        sales = 1000.0 + i
        payload = _week_payload(start, sales=sales, txn=100 + i)
        path = tmp_path / f"olo_pay_data_{start.replace('-', '')}.json"
        _write_week(path, payload)
        paths.append(path)

    # Pass paths out of order to prove chronological combine.
    shuffled = [paths[i] for i in (3, 0, 10, 1, 5, 2, 8, 4, 7, 6, 9)]
    combined = combine_weekly_files(shuffled, methodology)

    week_starts = [w["week_start_date"] for w in combined["weeks"]]
    assert week_starts == starts
    assert week_starts[-1] == "2026-08-24"

    # Values remain source-derived (not recomputed / invented).
    for path, week in zip(paths, combined["weeks"]):
        source = json.loads(path.read_text(encoding="utf-8"))["weeks"][0]
        assert week["totals"] == source["totals"]
        assert week["authorization"] == source["authorization"]
        assert week["card_brand_mix"] == source["card_brand_mix"]
        assert week["ownership_split"] == source["ownership_split"]

    assert combined["filter"]["processor"] == "Stripe"
    assert "Company Owned" in combined["filter"]["shop_filter"]
    assert combined["brand_order"] == BRAND_ORDER
    assert "shop_coverage" in combined
    assert "definitions" in combined
    assert "methodology" in combined
    assert "certification" in combined
    assert combined["certification"]["status"] in {"ok", "certified", "pass"}


def test_combine_weekly_files_is_deterministic(tmp_path: Path):
    """Same inputs must yield byte-equivalent output including certification metadata."""
    import time

    methodology = _methodology()
    starts = ["2026-08-10", "2026-08-17", "2026-08-24"]
    paths = []
    for i, start in enumerate(starts):
        payload = _week_payload(start, sales=1000.0 + i, txn=100 + i)
        path = tmp_path / f"olo_pay_data_{start.replace('-', '')}.json"
        _write_week(path, payload)
        paths.append(path)

    first = combine_weekly_files(paths, methodology)
    time.sleep(1.05)
    second = combine_weekly_files(paths, methodology)

    assert first == second
    assert json.dumps(first, sort_keys=True) == json.dumps(second, sort_keys=True)
    # If certified_at is present, it must come from stable source metadata — not wall clock.
    if "certified_at" in first.get("certification", {}):
        assert first["certification"]["certified_at"] == first.get("generated_at")


def test_rejects_non_monday_week_start():
    payload = _week_payload("2026-08-25")  # Tuesday
    # week_end still +6 from that date so only Monday check fires cleanly
    errors = validate_week(payload, "2026-08-25")
    assert _error_codes(errors) & {"week_not_monday", "non_monday_week_start"}


def test_rejects_incorrect_sunday_end_date():
    payload = _week_payload("2026-08-24", week_end="2026-08-29")  # Saturday
    errors = validate_week(payload, "2026-08-24")
    assert "incorrect_week_end" in _error_codes(errors)


def test_rejects_multiple_weeks_per_file():
    extra = _week_payload("2026-08-17")["weeks"][0]
    payload = _week_payload("2026-08-24", extra_weeks=[extra])
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {"multiple_weeks", "multiple_weeks_per_file"}


def test_rejects_duplicate_weeks(tmp_path: Path):
    methodology = _methodology()
    a = _write_week(tmp_path / "a.json", _week_payload("2026-08-17"))
    b = _write_week(tmp_path / "b.json", _week_payload("2026-08-17", sales=2000.0))
    with pytest.raises(ValueError, match="(?i)duplicate"):
        combine_weekly_files([a, b], methodology)


def test_rejects_gapped_weeks(tmp_path: Path):
    methodology = _methodology()
    a = _write_week(tmp_path / "a.json", _week_payload("2026-08-10"))
    b = _write_week(tmp_path / "b.json", _week_payload("2026-08-24"))  # gap: missing 08-17
    with pytest.raises(ValueError, match="(?i)gap"):
        combine_weekly_files([a, b], methodology)


def test_rejects_non_stripe_processor():
    payload = _week_payload(processor="Paytronix")
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {"non_stripe", "processor_not_stripe"}


def test_rejects_shop_filter_without_company_owned():
    payload = _week_payload(shop_filter="none — all Olo Pay Stripe shops.")
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "shop_filter_not_company_owned",
        "missing_company_owned_filter",
    }


def test_rejects_manual_excel_shop_filter_even_if_company_owned_mentioned():
    """Company Owned alone is insufficient — Gold VW_DIM_STORE_CURATED.OWNERSHIP required."""
    payload = _week_payload(
        shop_filter="Company Owned shops from the Excel mapping file / manual store list."
    )
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "shop_filter_missing_gold_ownership",
        "shop_filter_not_vw_dim_store_curated",
        "shop_filter_manual_list",
    }


def test_rejects_missing_ownership_split():
    payload = _week_payload()
    del payload["weeks"][0]["ownership_split"]
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "missing_ownership_split",
        "ownership_split_required",
    }


def test_rejects_ownership_split_missing_required_fields():
    payload = _week_payload()
    payload["weeks"][0]["ownership_split"] = {"company_owned_sales": 1000.0}
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "incomplete_ownership_split",
        "ownership_split_missing_fields",
    }


def test_rejects_nonzero_franchised_sales():
    payload = _week_payload(franchised=10.0)
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {"nonzero_franchised_sales", "franchised_sales_nonzero"}


def test_rejects_nonzero_unmapped_sales():
    payload = _week_payload(unmapped=3.53)
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "nonzero_unmapped_sales",
        "unmapped_sales_nonzero",
    }


def test_rejects_transaction_order_mismatch():
    payload = _week_payload(txn=100, orders=99)
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "transaction_order_mismatch",
        "txn_order_mismatch",
    }


def test_rejects_incorrect_average_ticket():
    payload = _week_payload(sales=1000.0, txn=100, avg_ticket=9.99)
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {"incorrect_avg_ticket", "avg_ticket_mismatch"}


def test_rejects_incorrect_auth_rate_math():
    payload = _week_payload(txn=100, declined=4, failed=0, auth_rate=50.0)
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {"incorrect_auth_rate", "auth_rate_mismatch"}


def test_rejects_brand_totals_not_reconciling_to_sales_and_count():
    brands = {
        "Visa": {"amount": 100.0, "pct_of_digital_sales": 25.0, "TRANSACTION_COUNT": 10},
        "Mastercard": {
            "amount": 100.0,
            "pct_of_digital_sales": 25.0,
            "TRANSACTION_COUNT": 10,
        },
        "Amex": {"amount": 100.0, "pct_of_digital_sales": 25.0, "TRANSACTION_COUNT": 10},
        "Discover": {
            "amount": 100.0,
            "pct_of_digital_sales": 25.0,
            "TRANSACTION_COUNT": 10,
        },
    }
    # sales=1000 but brand amounts sum to 400; counts 40 vs txn 100
    payload = _week_payload(sales=1000.0, txn=100, brands=brands)
    errors = validate_week(payload, "2026-08-24")
    codes = _error_codes(errors)
    assert codes & {
        "brand_amount_mismatch",
        "brand_totals_mismatch",
        "brand_count_mismatch",
    }


def test_rejects_brand_percentages_not_summing_to_100():
    brands = {
        "Visa": {"amount": 250.0, "pct_of_digital_sales": 20.0, "TRANSACTION_COUNT": 25},
        "Mastercard": {
            "amount": 250.0,
            "pct_of_digital_sales": 20.0,
            "TRANSACTION_COUNT": 25,
        },
        "Amex": {"amount": 250.0, "pct_of_digital_sales": 20.0, "TRANSACTION_COUNT": 25},
        "Discover": {
            "amount": 250.0,
            "pct_of_digital_sales": 20.0,
            "TRANSACTION_COUNT": 25,
        },
    }
    payload = _week_payload(sales=1000.0, txn=100, brands=brands, mix_checksum=80.0)
    errors = validate_week(payload, "2026-08-24")
    assert _error_codes(errors) & {
        "brand_pct_not_100",
        "brand_percentage_mismatch",
        "mix_checksum_mismatch",
    }


def test_does_not_require_dedupe_rows_equal_week_txn_count():
    """Cumulative source_rows_after_dedupe must not be treated as a week KPI."""
    payload = _week_payload(txn=100)
    assert payload["error_log"][0]["source_rows_after_dedupe"] != 100
    errors = validate_week(payload, "2026-08-24")
    assert errors == []
    assert not any("dedupe" in (e.get("code") or "") for e in errors)


def test_validate_week_expected_week_mismatch():
    payload = _week_payload("2026-08-24")
    errors = validate_week(payload, "2026-08-17")
    assert _error_codes(errors) & {
        "week_mismatch",
        "expected_week_mismatch",
    }


def test_cli_fail_closed_writes_report_only(tmp_path: Path):
    from scripts.import_olo_pay import main

    bad = _week_payload(franchised=12.0)
    weekly = _write_week(tmp_path / "olo_pay_data_20260824.json", bad)
    methodology = tmp_path / "olo_pay_methodology.json"
    methodology.write_text(json.dumps(_methodology()), encoding="utf-8")
    out = tmp_path / "out.json"
    preview = tmp_path / "preview.json"
    report = tmp_path / "report.json"

    rc = main(
        [
            str(weekly),
            "--methodology",
            str(methodology),
            "--out",
            str(out),
            "--report",
            str(report),
            "--preview-copy",
            str(preview),
        ]
    )
    assert rc == 1
    assert report.is_file()
    assert not out.exists()
    assert not preview.exists()
    payload = json.loads(report.read_text(encoding="utf-8"))
    assert payload["status"] == "failed"
    assert payload["error_count"] >= 1
