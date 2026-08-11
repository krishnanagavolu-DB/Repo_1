from __future__ import annotations

import hashlib
import math
from dataclasses import asdict, dataclass
from datetime import date
from pathlib import Path
from typing import Any

import pandas as pd


AUTH_REQUIRED = {
    "Network",
    "Entry Mode",
    "Mobile Wallet",
    "Auth Response cd",
    "Auth Response",
    "Auth Request Cnt",
    "Authorization",
}

IX_REQUIRED = {
    "Card Type",
    "Transaction",
    "Entry Mode",
    "Mobile Wallet Desc",
    "Surcharge Reason",
    "Transaction Cnt",
    "Transaction Amt",
    "Interchange Fee",
}

AUTH_MEASURES = {"Auth Request Cnt", "Authorization"}
IX_MEASURES = {"Transaction Cnt", "Transaction Amt", "Interchange Fee"}


@dataclass
class Check:
    severity: str
    code: str
    message: str
    week: str | None = None
    details: dict[str, Any] | None = None


def _add(
    checks: list[Check],
    severity: str,
    code: str,
    message: str,
    week: str | None = None,
    **details: Any,
) -> None:
    checks.append(
        Check(
            severity=severity,
            code=code,
            message=message,
            week=week,
            details=details or None,
        )
    )


def _numeric(
    df: pd.DataFrame,
    columns: set[str],
    dataset: str,
    week: str,
    checks: list[Check],
) -> pd.DataFrame:
    out = df.copy()
    for column in columns:
        if column not in out:
            continue
        parsed = pd.to_numeric(out[column], errors="coerce")
        invalid = int((parsed.isna() & out[column].notna()).sum())
        if invalid:
            _add(
                checks,
                "error",
                "invalid_numeric",
                f"{dataset}.{column} contains {invalid} non-numeric value(s)",
                week,
                column=column,
                invalid_rows=invalid,
            )
        nonfinite = int((parsed.notna() & ~parsed.map(math.isfinite)).sum())
        if nonfinite:
            _add(
                checks,
                "error",
                "nonfinite_numeric",
                f"{dataset}.{column} contains {nonfinite} infinite value(s)",
                week,
                column=column,
            )
        negative = int((parsed < 0).sum())
        if negative:
            _add(
                checks,
                "error",
                "negative_measure",
                f"{dataset}.{column} contains {negative} negative value(s)",
                week,
                column=column,
            )
        if column.endswith("Cnt"):
            fractional = int(((parsed % 1).abs() > 1e-9).sum())
            if fractional:
                _add(
                    checks,
                    "error",
                    "fractional_count",
                    f"{dataset}.{column} contains {fractional} fractional count(s)",
                    week,
                    column=column,
                )
        out[column] = parsed.fillna(0)
    return out


def _schema_check(
    df: pd.DataFrame,
    required: set[str],
    dataset: str,
    week: str,
    checks: list[Check],
) -> bool:
    missing = sorted(required - set(df.columns))
    if missing:
        _add(
            checks,
            "error",
            "missing_columns",
            f"{dataset} is missing required columns: {', '.join(missing)}",
            week,
            columns=missing,
        )
        return False
    if df.empty:
        _add(checks, "error", "empty_file", f"{dataset} contains no rows", week)
        return False
    return True


def _duplicate_check(
    df: pd.DataFrame,
    measures: set[str],
    dataset: str,
    week: str,
    checks: list[Check],
) -> None:
    exact = int(df.duplicated(keep=False).sum())
    if exact:
        _add(
            checks,
            "error",
            "exact_duplicates",
            f"{dataset} has {exact} rows participating in exact duplicates; totals may double-count",
            week,
            duplicate_rows=exact,
        )

    keys = [column for column in df.columns if column not in measures]
    duplicate_keys = int(df.duplicated(subset=keys, keep=False).sum()) if keys else 0
    if duplicate_keys and not exact:
        _add(
            checks,
            "warning",
            "duplicate_grain",
            f"{dataset} has {duplicate_keys} rows sharing the same dimensional grain",
            week,
            duplicate_rows=duplicate_keys,
        )


def _null_check(
    df: pd.DataFrame,
    columns: list[str],
    dataset: str,
    week: str,
    checks: list[Check],
) -> None:
    for column in columns:
        if column not in df:
            continue
        missing = int(df[column].isna().sum())
        if missing:
            _add(
                checks,
                "error",
                "missing_critical_value",
                f"{dataset}.{column} has {missing} blank value(s)",
                week,
                column=column,
                missing_rows=missing,
            )


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def validate_discovered_weeks(
    discovered: list[dict[str, Any]],
    dashboard_paths: list[Path] | None = None,
) -> dict[str, Any]:
    checks: list[Check] = []
    summaries: list[dict[str, Any]] = []

    starts = [date.fromisoformat(item["week_start"]) for item in discovered]
    if starts != sorted(starts):
        _add(checks, "error", "week_order", "Week folders are not in chronological order")
    if len(starts) != len(set(starts)):
        _add(checks, "error", "duplicate_week", "Duplicate week folder dates found")
    for start in starts:
        if start.weekday() != 0:
            _add(
                checks,
                "error",
                "week_not_monday",
                f"Week folder {start.isoformat()} is not a Monday",
                start.isoformat(),
            )
    for previous, current in zip(starts, starts[1:]):
        gap = (current - previous).days
        if gap != 7:
            _add(
                checks,
                "warning",
                "week_gap",
                f"Expected a 7-day gap; found {gap} days",
                current.isoformat(),
                prior_week=previous.isoformat(),
            )

    for item in discovered:
        week = item["week_start"]
        auth = pd.read_excel(item["auth"])
        ix = pd.read_excel(item["interchange"])
        auth_ok = _schema_check(auth, AUTH_REQUIRED, "Auth", week, checks)
        ix_ok = _schema_check(ix, IX_REQUIRED, "Interchange", week, checks)
        if not auth_ok or not ix_ok:
            continue

        auth = _numeric(auth, AUTH_MEASURES, "Auth", week, checks)
        ix = _numeric(ix, IX_MEASURES, "Interchange", week, checks)
        _duplicate_check(auth, AUTH_MEASURES, "Auth", week, checks)
        _duplicate_check(ix, IX_MEASURES, "Interchange", week, checks)
        _null_check(
            auth,
            ["Network", "Entry Mode", "Auth Response cd", "Auth Request Cnt"],
            "Auth",
            week,
            checks,
        )
        _null_check(
            ix,
            ["Card Type", "Transaction", "Entry Mode", "Transaction Cnt", "Transaction Amt"],
            "Interchange",
            week,
            checks,
        )

        auth_codes = auth["Auth Response cd"].map(
            lambda value: "" if pd.isna(value) else str(value).strip().zfill(2)
        )
        approved_mask = auth_codes == "00"
        auth_total = float(auth["Auth Request Cnt"].sum())
        approved_count = float(auth.loc[approved_mask, "Auth Request Cnt"].sum())
        approved_amount = float(auth.loc[approved_mask, "Authorization"].sum())
        if auth_total <= 0:
            _add(checks, "error", "zero_auth_total", "Auth request total is zero", week)
        if approved_count > auth_total:
            _add(checks, "error", "approval_exceeds_total", "Approved auth count exceeds total", week)

        tx = ix["Transaction"].astype(str).str.strip().str.upper()
        unknown_tx = sorted(set(tx) - {"SALE", "RETURN"})
        if unknown_tx:
            _add(
                checks,
                "warning",
                "unknown_transaction_type",
                f"Unexpected transaction types: {', '.join(unknown_tx)}",
                week,
            )
        sales = ix.loc[tx == "SALE"]
        returns = ix.loc[tx == "RETURN"]
        sales_count = float(sales["Transaction Cnt"].sum())
        sales_amount = float(sales["Transaction Amt"].sum())
        sales_fee = float(sales["Interchange Fee"].sum())
        return_amount = float(returns["Transaction Amt"].sum())
        if sales_count <= 0 or sales_amount <= 0:
            _add(checks, "error", "zero_sales", "Sales count/amount must be positive", week)

        count_ratio = sales_count / approved_count if approved_count else 0
        amount_ratio = sales_amount / approved_amount if approved_amount else 0
        if not 0.80 <= count_ratio <= 1.20:
            _add(
                checks,
                "warning",
                "auth_sale_count_reconciliation",
                f"Sales/auth count ratio is {count_ratio:.3f}, outside 0.80–1.20",
                week,
            )
        if not 0.80 <= amount_ratio <= 1.20:
            _add(
                checks,
                "warning",
                "auth_sale_amount_reconciliation",
                f"Sales/auth dollar ratio is {amount_ratio:.3f}, outside 0.80–1.20",
                week,
            )

        summaries.append(
            {
                "week_start": week,
                "auth_rows": len(auth),
                "interchange_rows": len(ix),
                "auth_total_cnt": auth_total,
                "auth_approved_cnt": approved_count,
                "auth_rate": approved_count / auth_total if auth_total else 0,
                "approved_auth_amt": approved_amount,
                "sales_cnt": sales_count,
                "sales_amt": sales_amount,
                "return_amt": return_amount,
                "interchange_fee": sales_fee,
                "auth_to_sales_count_ratio": count_ratio,
                "auth_to_sales_amount_ratio": amount_ratio,
            }
        )

    for previous, current in zip(summaries, summaries[1:]):
        week = current["week_start"]
        for field, threshold in [
            ("sales_amt", 0.40),
            ("sales_cnt", 0.40),
            ("approved_auth_amt", 0.40),
            ("auth_total_cnt", 0.40),
        ]:
            prior = previous[field]
            change = (current[field] - prior) / prior if prior else 0
            if abs(change) > threshold:
                _add(
                    checks,
                    "warning",
                    "week_over_week_outlier",
                    f"{field} changed {change:+.1%} week over week",
                    week,
                    field=field,
                    change=change,
                )
        auth_rate_change = current["auth_rate"] - previous["auth_rate"]
        if abs(auth_rate_change) > 0.02:
            _add(
                checks,
                "warning",
                "auth_rate_outlier",
                f"Auth rate changed {auth_rate_change:+.2%} week over week",
                week,
            )

    paths = [path for path in (dashboard_paths or []) if path.exists()]
    if paths:
        hashes = {_sha256(path) for path in paths}
        if len(hashes) > 1:
            _add(
                checks,
                "error",
                "dashboard_copy_mismatch",
                "Processed and published dashboard.json copies do not match",
                files=[str(path) for path in paths],
            )

    errors = [check for check in checks if check.severity == "error"]
    warnings = [check for check in checks if check.severity == "warning"]
    return {
        "status": "failed" if errors else "passed_with_warnings" if warnings else "passed",
        "certified": not errors,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "weeks_checked": len(discovered),
        "checks": [asdict(check) for check in checks],
        "week_summaries": summaries,
    }


def raise_for_errors(report: dict[str, Any]) -> None:
    if report["error_count"]:
        messages = [
            f"[{check['code']}] {check['message']}"
            for check in report["checks"]
            if check["severity"] == "error"
        ]
        raise ValueError("Worldpay data validation failed:\n" + "\n".join(messages))
