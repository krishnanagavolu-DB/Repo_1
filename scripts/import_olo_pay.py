#!/usr/bin/env python3
"""Validate and combine company-owned-only Olo Pay weekly JSON exports.

Usage:
    python3 scripts/import_olo_pay.py data/raw/olo-pay/olo_pay_data_*.json \\
      --methodology data/raw/olo-pay/olo_pay_methodology.json \\
      --out data/processed/olo_pay_data.json \\
      --report data/processed/olo_pay_validation_report.json \\
      --preview-copy site/preview/data/olo_pay_data.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]

AMOUNT_TOL = 0.02
PCT_TOL = 0.05
WOW_PCT_TOL = 0.05  # half-step of one-decimal source rounding
WOW_AUTH_PP_TOL = 0.01  # one quantum of two-decimal AUTH_RATE_PP vs unrounded rate delta
AUTH_RATE_TOL = 0.015

WEEK_FILE_RE = re.compile(r"olo_pay_data_(\d{8})")


def _issue(code: str, message: str, *, severity: str = "error", week: str | None = None) -> dict:
    item: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if week:
        item["week"] = week
    return item


def _parse_week_start(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _expected_week_from_path(path: Path) -> str | None:
    match = WEEK_FILE_RE.search(path.name)
    if not match:
        return None
    raw = match.group(1)
    try:
        return date(int(raw[0:4]), int(raw[4:6]), int(raw[6:8])).isoformat()
    except ValueError:
        return None


def _round_money_div(numerator: float, denominator: int) -> float:
    if denominator == 0:
        return 0.0
    return round(numerator / denominator, 2)


def _auth_rate(approved: int, declined: int, failed: int) -> float:
    attempts = approved + declined + failed
    if attempts == 0:
        return 0.0
    return round(approved / attempts * 100, 2)


def validate_week(payload: dict, expected_week: str) -> list[dict]:
    """Validate one weekly Olo Pay payload. Returns error dicts (empty if ok)."""
    errors: list[dict] = []

    if not isinstance(payload, dict):
        return [_issue("invalid_payload", "Weekly payload must be a JSON object")]

    filt = payload.get("filter") or {}
    processor = filt.get("processor")
    if processor != "Stripe":
        errors.append(
            _issue(
                "processor_not_stripe",
                f"filter.processor must be 'Stripe' (got {processor!r})",
                week=expected_week,
            )
        )

    shop_filter = str(filt.get("shop_filter") or "")
    if "Company Owned" not in shop_filter:
        errors.append(
            _issue(
                "shop_filter_not_company_owned",
                "filter.shop_filter must mention Company Owned",
                week=expected_week,
            )
        )
    elif (
        "VW_DIM_STORE_CURATED" not in shop_filter
        or "OWNERSHIP" not in shop_filter
    ):
        # Require Gold curated ownership — a manual/Excel "Company Owned" list is not enough.
        errors.append(
            _issue(
                "shop_filter_missing_gold_ownership",
                "filter.shop_filter must identify VW_DIM_STORE_CURATED and OWNERSHIP "
                "(not a manual/Excel store list)",
                week=expected_week,
            )
        )

    weeks = payload.get("weeks")
    if not isinstance(weeks, list) or not weeks:
        errors.append(
            _issue("missing_weeks", "payload.weeks must be a non-empty array", week=expected_week)
        )
        return errors

    if len(weeks) != 1:
        errors.append(
            _issue(
                "multiple_weeks_per_file",
                f"expected exactly one week per file, found {len(weeks)}",
                week=expected_week,
            )
        )
        # Still validate the first week for additional signal, but structure is wrong.
        # Do not continue deep checks on ambiguous multi-week payloads beyond first.
        # Fall through to validate weeks[0] against expected_week for mismatch codes.

    week = weeks[0] if isinstance(weeks[0], dict) else None
    if week is None:
        errors.append(_issue("invalid_week", "weeks[0] must be an object", week=expected_week))
        return errors

    week_start = week.get("week_start_date")
    if week_start != expected_week:
        errors.append(
            _issue(
                "expected_week_mismatch",
                f"week_start_date {week_start!r} does not match expected {expected_week!r}",
                week=expected_week,
            )
        )

    start = _parse_week_start(str(week_start)) if week_start else None
    if start is None:
        errors.append(
            _issue(
                "invalid_week_start",
                f"week_start_date {week_start!r} is not an ISO date",
                week=expected_week,
            )
        )
    else:
        if start.weekday() != 0:
            errors.append(
                _issue(
                    "week_not_monday",
                    f"week_start_date {week_start} is not a Monday",
                    week=str(week_start),
                )
            )
        expected_end = (start + timedelta(days=6)).isoformat()
        week_end = week.get("week_end_date")
        # expected_end is always Sunday (Monday + 6); a mismatch covers non-Sunday ends.
        if week_end != expected_end:
            errors.append(
                _issue(
                    "incorrect_week_end",
                    f"week_end_date {week_end!r} must be Sunday {expected_end}",
                    week=str(week_start),
                )
            )

    totals = week.get("totals") or {}
    ownership = week.get("ownership_split")
    auth = week.get("authorization") or {}
    brands = week.get("card_brand_mix") or {}

    try:
        sales = float(totals.get("SALES_VOLUME"))
        txn = int(totals.get("TRANSACTION_COUNT"))
        orders = int(totals.get("ORDER_COUNT"))
        avg_ticket = float(totals.get("AVG_TICKET"))
    except (TypeError, ValueError):
        errors.append(
            _issue(
                "invalid_totals",
                "totals must include numeric SALES_VOLUME, TRANSACTION_COUNT, ORDER_COUNT, AVG_TICKET",
                week=expected_week,
            )
        )
        return errors

    if not isinstance(ownership, dict):
        errors.append(
            _issue(
                "missing_ownership_split",
                "weeks[].ownership_split object is required",
                week=expected_week,
            )
        )
        return errors

    required_ownership_fields = (
        "company_owned_sales",
        "franchised_sales",
        "unmapped_or_other_sales",
    )
    missing_ownership = [f for f in required_ownership_fields if f not in ownership]
    if missing_ownership:
        errors.append(
            _issue(
                "incomplete_ownership_split",
                "ownership_split missing required numeric fields: "
                + ", ".join(missing_ownership),
                week=expected_week,
            )
        )
        return errors

    try:
        company_owned = float(ownership["company_owned_sales"])
        franchised = float(ownership["franchised_sales"])
        unmapped = float(ownership["unmapped_or_other_sales"])
    except (TypeError, ValueError):
        errors.append(
            _issue(
                "incomplete_ownership_split",
                "ownership_split fields company_owned_sales, franchised_sales, "
                "and unmapped_or_other_sales must be numeric",
                week=expected_week,
            )
        )
        return errors

    if franchised != 0.0:
        errors.append(
            _issue(
                "nonzero_franchised_sales",
                f"franchised_sales must be 0 (got {franchised})",
                week=expected_week,
            )
        )
    if unmapped != 0.0:
        errors.append(
            _issue(
                "nonzero_unmapped_sales",
                f"unmapped_or_other_sales must be 0 (got {unmapped})",
                week=expected_week,
            )
        )
    if abs(company_owned - sales) > AMOUNT_TOL:
        errors.append(
            _issue(
                "company_owned_sales_mismatch",
                f"company_owned_sales {company_owned} must equal SALES_VOLUME {sales}",
                week=expected_week,
            )
        )

    if txn != orders:
        errors.append(
            _issue(
                "transaction_order_mismatch",
                f"TRANSACTION_COUNT ({txn}) must equal ORDER_COUNT ({orders})",
                week=expected_week,
            )
        )

    expected_avg = _round_money_div(sales, orders)
    if round(float(avg_ticket), 2) != expected_avg:
        errors.append(
            _issue(
                "incorrect_avg_ticket",
                f"AVG_TICKET {avg_ticket} != SALES_VOLUME/ORDER_COUNT {expected_avg}",
                week=expected_week,
            )
        )

    try:
        approved = int(auth.get("approved"))
        declined = int(auth.get("declined"))
        failed = int(auth.get("failed"))
        auth_rate = float(auth.get("auth_rate_pct"))
    except (TypeError, ValueError):
        errors.append(
            _issue(
                "invalid_authorization",
                "authorization must include approved, declined, failed, auth_rate_pct",
                week=expected_week,
            )
        )
        return errors

    if approved != txn:
        errors.append(
            _issue(
                "approved_txn_mismatch",
                f"authorization.approved ({approved}) must equal TRANSACTION_COUNT ({txn})",
                week=expected_week,
            )
        )

    expected_rate = _auth_rate(approved, declined, failed)
    if abs(auth_rate - expected_rate) > AUTH_RATE_TOL:
        errors.append(
            _issue(
                "incorrect_auth_rate",
                f"auth_rate_pct {auth_rate} != computed {expected_rate}",
                week=expected_week,
            )
        )

    if not isinstance(brands, dict) or not brands:
        errors.append(
            _issue("missing_card_brand_mix", "card_brand_mix is required", week=expected_week)
        )
        return errors

    brand_amount = 0.0
    brand_count = 0
    brand_pct = 0.0
    for name, row in brands.items():
        if not isinstance(row, dict):
            errors.append(
                _issue(
                    "invalid_brand_row",
                    f"card_brand_mix[{name!r}] must be an object",
                    week=expected_week,
                )
            )
            continue
        try:
            brand_amount += float(row.get("amount"))
            brand_count += int(row.get("TRANSACTION_COUNT"))
            brand_pct += float(row.get("pct_of_digital_sales"))
        except (TypeError, ValueError):
            errors.append(
                _issue(
                    "invalid_brand_row",
                    f"card_brand_mix[{name!r}] missing numeric amount/count/pct",
                    week=expected_week,
                )
            )

    if abs(brand_amount - sales) > AMOUNT_TOL:
        errors.append(
            _issue(
                "brand_amount_mismatch",
                f"brand amounts sum {brand_amount:.2f} != SALES_VOLUME {sales}",
                week=expected_week,
            )
        )
    if brand_count != txn:
        errors.append(
            _issue(
                "brand_count_mismatch",
                f"brand TRANSACTION_COUNT sum {brand_count} != TRANSACTION_COUNT {txn}",
                week=expected_week,
            )
        )
    if abs(brand_pct - 100.0) > PCT_TOL:
        errors.append(
            _issue(
                "brand_pct_not_100",
                f"brand pct_of_digital_sales sum {brand_pct} != 100",
                week=expected_week,
            )
        )

    mix_checksum = week.get("mix_checksum")
    if mix_checksum is not None:
        try:
            checksum_val = float(mix_checksum)
        except (TypeError, ValueError):
            errors.append(
                _issue(
                    "mix_checksum_invalid",
                    f"mix_checksum {mix_checksum!r} is not numeric",
                    week=expected_week,
                )
            )
        else:
            if abs(checksum_val - 100.0) > PCT_TOL:
                errors.append(
                    _issue(
                        "mix_checksum_mismatch",
                        f"mix_checksum {mix_checksum} != 100",
                        week=expected_week,
                    )
                )

    # Intentionally do NOT require error_log source_rows_after_dedupe to equal
    # this week's TRANSACTION_COUNT — that field is cumulative extract metadata.

    return errors


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))



def _metadata_fingerprint(payload: dict) -> dict:
    """Shell fields that must stay identical across weekly source files."""
    return {
        "definitions": payload.get("definitions"),
        "filter": payload.get("filter"),
        "brand_order": payload.get("brand_order"),
        "environment": payload.get("environment"),
        "week_cadence": payload.get("week_cadence"),
        "dashboard_tab": payload.get("dashboard_tab"),
        "methodology_file": payload.get("methodology_file"),
    }


def _reject_divergent_metadata(loaded: list[tuple[str, Path, dict]]) -> None:
    if len(loaded) < 2:
        return
    base_week, base_path, base_payload = loaded[0]
    base = _metadata_fingerprint(base_payload)
    for week_start, path, payload in loaded[1:]:
        current = _metadata_fingerprint(payload)
        for key in (
            "definitions",
            "filter",
            "brand_order",
            "environment",
            "week_cadence",
            "dashboard_tab",
            "methodology_file",
        ):
            if current.get(key) != base.get(key):
                label = "scope/environment" if key == "environment" else key
                raise ValueError(
                    f"divergent {label} metadata between {base_path.name} and {path.name}"
                )


def _raw_auth_rate_from_week(week: dict) -> float | None:
    """Unrounded auth rate % from authorization counts (for WoW half-step checks)."""
    auth = week.get("authorization") or {}
    try:
        approved = int(auth.get("approved"))
        declined = int(auth.get("declined"))
        failed = int(auth.get("failed"))
    except (TypeError, ValueError):
        return None
    attempts = approved + declined + failed
    if attempts <= 0:
        return None
    return approved / attempts * 100.0


def _validate_adjacent_week_over_week(weeks: list[dict]) -> None:
    """Published week_over_week deltas must match adjacent source weeks.

    Compare the stated one-decimal (or two-decimal auth) source value against the
    *unrounded* computed delta with half-step tolerance so banker's and half-up
    ties both pass while materially wrong values still fail.
    """
    for prev, curr in zip(weeks, weeks[1:]):
        wow = curr.get("week_over_week") or {}
        try:
            prev_sales = float((prev.get("totals") or {}).get("SALES_VOLUME"))
            curr_sales = float((curr.get("totals") or {}).get("SALES_VOLUME"))
            prev_txn = int((prev.get("totals") or {}).get("TRANSACTION_COUNT"))
            curr_txn = int((curr.get("totals") or {}).get("TRANSACTION_COUNT"))
        except (TypeError, ValueError) as err:
            raise ValueError(f"adjacent week totals unreadable for week_over_week: {err}") from err
        prev_auth = _raw_auth_rate_from_week(prev)
        curr_auth = _raw_auth_rate_from_week(curr)
        if prev_auth is None or curr_auth is None:
            raise ValueError("adjacent week authorization unreadable for week_over_week")

        expected_sales_pct = (
            0.0 if prev_sales == 0 else (curr_sales - prev_sales) / prev_sales * 100.0
        )
        expected_txn_pct = (
            0.0 if prev_txn == 0 else (curr_txn - prev_txn) / prev_txn * 100.0
        )
        expected_auth_pp = curr_auth - prev_auth

        sales_raw = wow.get("SALES_VOLUME_PCT")
        txn_raw = wow.get("TRANSACTION_COUNT_PCT")
        auth_raw = wow.get("AUTH_RATE_PP")
        # All-null WoW means "not published for this first/adjacent week" — skip.
        if sales_raw is None and txn_raw is None and auth_raw is None:
            continue
        # Partial nulls or non-numerics are structured validation failures.
        week_label = curr.get("week_start_date")
        for field_name, raw in (
            ("SALES_VOLUME_PCT", sales_raw),
            ("TRANSACTION_COUNT_PCT", txn_raw),
            ("AUTH_RATE_PP", auth_raw),
        ):
            if raw is None:
                raise ValueError(
                    f"week_over_week invalid: {field_name} is null on {week_label}"
                )
            if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
                raise ValueError(
                    f"week_over_week non-numeric {field_name}={raw!r} on {week_label}"
                )
            if isinstance(raw, str):
                try:
                    float(raw)
                except ValueError as err:
                    raise ValueError(
                        f"week_over_week non-numeric {field_name}={raw!r} on {week_label}"
                    ) from err
        try:
            stated_sales = float(sales_raw)
            stated_txn = float(txn_raw)
            stated_auth = float(auth_raw)
        except (TypeError, ValueError) as err:
            raise ValueError(
                f"week_over_week non-numeric on {week_label}: {err}"
            ) from err

        # Half-step of published precision (+ float slack) accepts either tie rounding.
        if abs(stated_sales - expected_sales_pct) > WOW_PCT_TOL + 1e-9:
            raise ValueError(
                f"week_over_week SALES_VOLUME_PCT {stated_sales} != adjacent {expected_sales_pct} "
                f"for {curr.get('week_start_date')}"
            )
        if abs(stated_txn - expected_txn_pct) > WOW_PCT_TOL + 1e-9:
            raise ValueError(
                f"week_over_week TRANSACTION_COUNT_PCT {stated_txn} != adjacent {expected_txn_pct} "
                f"for {curr.get('week_start_date')}"
            )
        if abs(stated_auth - expected_auth_pp) > WOW_AUTH_PP_TOL + 1e-9:
            raise ValueError(
                f"week_over_week AUTH_RATE_PP {stated_auth} != adjacent {expected_auth_pp} "
                f"for {curr.get('week_start_date')}"
            )


def combine_weekly_files(paths: list[Path], methodology: dict) -> dict:
    """Load, validate, and chronologically combine weekly Olo Pay files.

    Raises ValueError when any hard validation error is present.
    """
    if not paths:
        raise ValueError("no weekly files provided")

    all_errors: list[dict] = []
    loaded: list[tuple[str, Path, dict]] = []

    for path in paths:
        path = Path(path)
        expected = _expected_week_from_path(path)
        payload = _load_json(path)
        if expected is None:
            # Fall back to embedded week start when filename is not canonical.
            weeks = payload.get("weeks") if isinstance(payload, dict) else None
            if isinstance(weeks, list) and weeks and isinstance(weeks[0], dict):
                expected = str(weeks[0].get("week_start_date") or "")
            if not expected:
                all_errors.append(
                    _issue(
                        "unrecognized_filename",
                        f"cannot derive week start from {path.name}",
                    )
                )
                continue
        file_errors = validate_week(payload, expected)
        all_errors.extend(file_errors)
        if isinstance(payload, dict):
            loaded.append((expected, path, payload))

    # Cross-file: duplicates and gaps (only among successfully identified weeks).
    starts = sorted({week_start for week_start, _, _ in loaded})
    seen: dict[str, Path] = {}
    for week_start, path, _payload in loaded:
        if week_start in seen:
            all_errors.append(
                _issue(
                    "duplicate_week",
                    f"duplicate week_start_date {week_start} in {seen[week_start].name} and {path.name}",
                    week=week_start,
                )
            )
            raise ValueError(f"duplicate week_start_date {week_start}")
        seen[week_start] = path

    if len(starts) >= 2:
        ordered_dates = [_parse_week_start(s) for s in starts]
        if all(ordered_dates):
            for prev, curr in zip(ordered_dates, ordered_dates[1:]):
                if curr - prev != timedelta(days=7):
                    all_errors.append(
                        _issue(
                            "gapped_weeks",
                            f"gap between {prev.isoformat()} and {curr.isoformat()}",
                        )
                    )
                    raise ValueError(
                        f"gap between weeks {prev.isoformat()} and {curr.isoformat()}"
                    )

    hard_errors = [e for e in all_errors if e.get("severity") == "error"]
    if hard_errors:
        summary = "; ".join(f"{e['code']}: {e['message']}" for e in hard_errors[:8])
        raise ValueError(f"validation failed ({len(hard_errors)} errors): {summary}")

    # Prefer chronological order by week start; keep latest payload's metadata shell.
    by_start = sorted(loaded, key=lambda item: item[0])
    _reject_divergent_metadata(by_start)
    shell = by_start[-1][2]
    weeks_out = []
    for week_start, _path, payload in by_start:
        # Source-derived: copy the week object as published, do not recompute KPIs.
        weeks_out.append(copy_week(payload["weeks"][0]))

    _validate_adjacent_week_over_week(weeks_out)

    # Deterministic: reuse source generated_at exactly (no wall-clock now()).
    certified_at = shell.get("generated_at")
    combined = {
        "generated_at": shell.get("generated_at"),
        "week_cadence": shell.get("week_cadence", "Monday-Sunday"),
        "dashboard_tab": shell.get("dashboard_tab", "Olo Pay"),
        "environment": shell.get("environment", "prod"),
        "definitions": shell.get("definitions") or methodology.get("kpi_definitions") or {},
        "methodology": methodology,
        "methodology_file": shell.get("methodology_file", "olo_pay_methodology.json"),
        "filter": shell.get("filter"),
        "brand_order": shell.get("brand_order") or list(methodology.get("brand_order") or []),
        "weeks": weeks_out,
        "shop_coverage": shell.get("shop_coverage"),
        "certification": {
            "status": "certified",
            "certified": True,
            "week_count": len(weeks_out),
            "latest_week_start": weeks_out[-1]["week_start_date"] if weeks_out else None,
            "certified_at": certified_at,
            "scope": "Company Owned only; processor Stripe",
        },
    }
    return combined


def copy_week(week: dict) -> dict:
    return json.loads(json.dumps(week))


def build_report(
    *,
    status: str,
    week_count: int,
    errors: list[dict],
    warnings: list[dict],
) -> dict:
    return {
        "status": status,
        "week_count": week_count,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "errors": errors,
        "warnings": warnings,
        "certified": status in {"ok", "certified", "pass"} and not errors,
    }


def _collect_validation(paths: list[Path]) -> tuple[list[dict], list[dict], list[tuple[str, Path, dict]]]:
    errors: list[dict] = []
    warnings: list[dict] = []
    loaded: list[tuple[str, Path, dict]] = []
    for path in paths:
        path = Path(path)
        expected = _expected_week_from_path(path)
        try:
            payload = _load_json(path)
        except (OSError, json.JSONDecodeError) as err:
            errors.append(_issue("invalid_json", f"{path}: {err}"))
            continue
        if expected is None:
            weeks = payload.get("weeks") if isinstance(payload, dict) else None
            if isinstance(weeks, list) and weeks and isinstance(weeks[0], dict):
                expected = str(weeks[0].get("week_start_date") or "")
        if not expected:
            errors.append(_issue("unrecognized_filename", f"cannot derive week from {path.name}"))
            continue
        for item in validate_week(payload, expected):
            if item.get("severity") == "warning":
                warnings.append(item)
            else:
                errors.append(item)
        if isinstance(payload, dict):
            loaded.append((expected, path, payload))

    seen: dict[str, Path] = {}
    for week_start, path, _payload in sorted(loaded, key=lambda x: x[0]):
        if week_start in seen:
            errors.append(
                _issue(
                    "duplicate_week",
                    f"duplicate week_start_date {week_start} in {seen[week_start].name} and {path.name}",
                    week=week_start,
                )
            )
        else:
            seen[week_start] = path

    starts = sorted(seen)
    dates = [_parse_week_start(s) for s in starts]
    if len(dates) >= 2 and all(dates):
        for prev, curr in zip(dates, dates[1:]):
            if curr - prev != timedelta(days=7):
                errors.append(
                    _issue(
                        "gapped_weeks",
                        f"gap between {prev.isoformat()} and {curr.isoformat()}",
                    )
                )
    return errors, warnings, loaded


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "weekly",
        nargs="+",
        type=Path,
        help="One or more olo_pay_data_YYYYMMDD.json weekly files",
    )
    parser.add_argument("--methodology", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    parser.add_argument("--preview-copy", type=Path, required=True)
    args = parser.parse_args(argv)

    weekly_paths = [p for p in args.weekly if p.is_file()]
    if not weekly_paths:
        print("ERROR: no weekly files found", file=sys.stderr)
        return 1

    try:
        methodology = _load_json(args.methodology)
    except (OSError, json.JSONDecodeError) as err:
        print(f"ERROR: methodology: {err}", file=sys.stderr)
        return 1

    errors, warnings, _loaded = _collect_validation(weekly_paths)
    for warning in warnings:
        print(f"WARNING {warning['code']}: {warning['message']}")

    if errors:
        report = build_report(
            status="failed",
            week_count=0,
            errors=errors,
            warnings=warnings,
        )
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        for error in errors:
            print(f"ERROR   {error['code']}: {error['message']}")
        print("\nNot written. Fix validation errors and rerun.")
        print(f"Wrote report {args.report}")
        return 1

    try:
        combined = combine_weekly_files(weekly_paths, methodology)
    except ValueError as err:
        report = build_report(
            status="failed",
            week_count=0,
            errors=[_issue("combine_failed", str(err))],
            warnings=warnings,
        )
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"ERROR   {err}")
        print("\nNot written. Fix validation errors and rerun.")
        return 1

    report = build_report(
        status="certified",
        week_count=len(combined["weeks"]),
        errors=[],
        warnings=warnings,
    )

    for target in (args.out, args.preview_copy):
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(combined, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {target}")

    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        f"Data certification: {report['status']} "
        f"({report['week_count']} weeks, "
        f"{report['error_count']} errors, {report['warning_count']} warnings)"
    )
    print(f"Wrote {args.report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
