from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import pandas as pd

from worldpay_dashboard.normalize import (
    canonical_card_brand,
    normalize_entry_method,
    normalize_wallet,
)

KPI_KEYS = [
    "auth_rate",
    "aov",
    "returns_pct_of_sales",
    "sales_volume",
    "transaction_volume",
    "ic_rate",
    "decline_volume",
    "ic_fee",
    "downgrade_rate",
]


def _week_end(week_start: str) -> str:
    start = date.fromisoformat(week_start)
    return (start + timedelta(days=6)).isoformat()


def _week_label(week_start: str) -> str:
    start = date.fromisoformat(week_start)
    end = start + timedelta(days=6)
    return f"{start.strftime('%b %-d')} – {end.strftime('%b %-d, %Y')}"


def _safe_div(num: float, den: float) -> float:
    if den == 0:
        return 0.0
    return float(num) / float(den)


def _mix_from_counts(counts: dict[str, float]) -> list[dict[str, Any]]:
    total = sum(counts.values())
    items = [
        {
            "label": label,
            "count": int(count) if float(count).is_integer() else float(count),
            "pct": _safe_div(count, total),
        }
        for label, count in counts.items()
    ]
    items.sort(key=lambda x: (-x["pct"], x["label"]))
    return items


def _auth_cd(series: pd.Series) -> pd.Series:
    out = []
    for v in series:
        if pd.isna(v):
            out.append("")
            continue
        s = str(v).strip()
        if s.isdigit():
            s = s.zfill(2)
        out.append(s)
    return pd.Series(out, index=series.index)


def _is_surcharged(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip()
    return ~s.isin(["", ".", "nan", "None", "NaN"])


def compute_week_kpis(
    auth_df: pd.DataFrame, ix_df: pd.DataFrame, week_start: str
) -> dict[str, Any]:
    auth = auth_df.copy()
    ix = ix_df.copy()

    auth["Auth Response cd"] = _auth_cd(auth["Auth Response cd"])
    auth["Auth Request Cnt"] = pd.to_numeric(auth["Auth Request Cnt"], errors="coerce").fillna(0)
    if "Authorization" in auth.columns:
        auth["Authorization"] = pd.to_numeric(auth["Authorization"], errors="coerce").fillna(0)
    else:
        auth["Authorization"] = 0.0

    auth_total = float(auth["Auth Request Cnt"].sum())
    auth_approved = float(
        auth.loc[auth["Auth Response cd"] == "00", "Auth Request Cnt"].sum()
    )
    auth_rate = _safe_div(auth_approved, auth_total)

    decline_mask = auth["Auth Response cd"] != "00"
    decline_volume = float(auth.loc[decline_mask, "Authorization"].sum())

    declines = auth.loc[decline_mask].copy()
    resp = declines["Auth Response"].astype(str).str.strip()
    declines = declines.loc[~resp.isin(["", ".", "nan", "None"])].copy()
    decline_grouped = (
        declines.groupby("Auth Response", dropna=False)["Auth Request Cnt"].sum().sort_values(ascending=False)
    )
    decline_reasons = [
        {"label": str(label), "count": int(cnt)} for label, cnt in decline_grouped.items()
    ]

    # Auth rate by entry method (from Auth Summary)
    auth["entry_method"] = auth["Entry Mode"].map(normalize_entry_method)
    auth_by_entry: list[dict[str, Any]] = []
    for label, group in auth.groupby("entry_method", dropna=False):
        total = float(group["Auth Request Cnt"].sum())
        approved = float(group.loc[group["Auth Response cd"] == "00", "Auth Request Cnt"].sum())
        auth_by_entry.append(
            {
                "label": str(label),
                "auth_rate": _safe_div(approved, total),
                "approved_cnt": approved,
                "total_cnt": total,
            }
        )
    auth_by_entry.sort(key=lambda x: (-x["total_cnt"], x["label"]))

    ix["Transaction"] = ix["Transaction"].astype(str).str.strip().str.upper()
    ix["Transaction Cnt"] = pd.to_numeric(ix["Transaction Cnt"], errors="coerce").fillna(0)
    ix["Transaction Amt"] = pd.to_numeric(ix["Transaction Amt"], errors="coerce").fillna(0)
    ix["Interchange Fee"] = pd.to_numeric(ix["Interchange Fee"], errors="coerce").fillna(0)

    sales = ix.loc[ix["Transaction"] == "SALE"].copy()
    returns = ix.loc[ix["Transaction"] == "RETURN"].copy()

    sales_cnt = float(sales["Transaction Cnt"].sum())
    sales_amt = float(sales["Transaction Amt"].sum())
    sales_fee = float(sales["Interchange Fee"].sum())
    return_amt = float(returns["Transaction Amt"].sum())

    if "Surcharge Reason" in sales.columns:
        surcharged = sales.loc[_is_surcharged(sales["Surcharge Reason"])]
        surcharged_amt = float(surcharged["Transaction Amt"].sum())
        surcharged_cnt = float(surcharged["Transaction Cnt"].sum())
    else:
        surcharged_amt = 0.0
        surcharged_cnt = 0.0
    downgrade_rate = _safe_div(surcharged_amt, sales_amt)

    sales["entry_method"] = sales["Entry Mode"].map(normalize_entry_method)
    sales["card_brand"] = sales["Card Type"].map(canonical_card_brand)
    wallet_col = "Mobile Wallet Desc" if "Mobile Wallet Desc" in sales.columns else None
    if wallet_col:
        sales["wallet"] = sales[wallet_col].map(normalize_wallet)
    else:
        sales["wallet"] = "Card / Other"

    entry_counts = sales.groupby("entry_method")["Transaction Cnt"].sum().to_dict()
    brand_counts = sales.groupby("card_brand")["Transaction Cnt"].sum().to_dict()
    wallet_counts = sales.groupby("wallet")["Transaction Cnt"].sum().to_dict()

    return {
        "id": week_start,
        "week_start": week_start,
        "week_end": _week_end(week_start),
        "label": _week_label(week_start),
        "kpis": {
            "auth_rate": auth_rate,
            "aov": _safe_div(sales_amt, sales_cnt),
            "returns_pct_of_sales": _safe_div(return_amt, sales_amt),
            "sales_volume": sales_amt,
            "transaction_volume": sales_cnt,
            "ic_rate": _safe_div(sales_fee, sales_amt),
            "decline_volume": decline_volume,
            "ic_fee": sales_fee,
            "downgrade_rate": downgrade_rate,
        },
        "totals": {
            "auth_approved_cnt": auth_approved,
            "auth_total_cnt": auth_total,
            "sales_amt": sales_amt,
            "sales_cnt": sales_cnt,
            "sales_fee": sales_fee,
            "return_amt": return_amt,
            "return_cnt": float(returns["Transaction Cnt"].sum()),
            "decline_amt": decline_volume,
            "surcharged_amt": surcharged_amt,
            "surcharged_cnt": surcharged_cnt,
        },
        "entry_method_mix": _mix_from_counts(entry_counts),
        "payment_type_mix": _mix_from_counts(brand_counts),
        "wallet_mix": _mix_from_counts(wallet_counts),
        "auth_rate_by_entry": auth_by_entry,
        "decline_reasons": decline_reasons,
    }


def _enrich_weeks(raw_weeks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    weeks = sorted(raw_weeks, key=lambda w: w["week_start"])
    histories: dict[str, list[dict[str, Any]]] = {k: [] for k in KPI_KEYS}
    for w in weeks:
        for key in KPI_KEYS:
            histories[key].append({"week_start": w["week_start"], "value": w["kpis"][key]})

    enriched: list[dict[str, Any]] = []
    for idx, w in enumerate(weeks):
        kpi_objs: dict[str, Any] = {}
        for key in KPI_KEYS:
            value = w["kpis"][key]
            delta = None
            if idx > 0:
                prev = weeks[idx - 1]["kpis"][key]
                delta = value - prev
            kpi_objs[key] = {
                "value": value,
                "delta": delta,
                "history": list(histories[key]),
            }
        enriched.append(
            {
                "id": w["id"],
                "label": w["label"],
                "week_start": w["week_start"],
                "week_end": w["week_end"],
                "kpis": kpi_objs,
                "entry_method_mix": w["entry_method_mix"],
                "payment_type_mix": w["payment_type_mix"],
                "wallet_mix": w["wallet_mix"],
                "auth_rate_by_entry": w["auth_rate_by_entry"],
                "decline_reasons": w["decline_reasons"],
                "totals": w["totals"],
            }
        )
    return enriched


def _ytd_from_weeks(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    empty = {
        "id": "ytd",
        "label": "YTD",
        "kpis": {k: {"value": 0.0, "delta": None, "history": []} for k in KPI_KEYS},
        "entry_method_mix": [],
        "payment_type_mix": [],
        "wallet_mix": [],
        "auth_rate_by_entry": [],
        "decline_reasons": [],
    }
    if not weeks:
        return empty

    year = date.fromisoformat(weeks[-1]["week_start"]).year
    year_weeks = [w for w in weeks if date.fromisoformat(w["week_start"]).year == year]
    auth_approved = sum(w["totals"]["auth_approved_cnt"] for w in year_weeks)
    auth_total = sum(w["totals"]["auth_total_cnt"] for w in year_weeks)
    sales_amt = sum(w["totals"]["sales_amt"] for w in year_weeks)
    sales_cnt = sum(w["totals"]["sales_cnt"] for w in year_weeks)
    sales_fee = sum(w["totals"]["sales_fee"] for w in year_weeks)
    return_amt = sum(w["totals"]["return_amt"] for w in year_weeks)
    decline_amt = sum(w["totals"].get("decline_amt", 0) for w in year_weeks)
    surcharged_amt = sum(w["totals"].get("surcharged_amt", 0) for w in year_weeks)

    entry_counts: dict[str, float] = {}
    brand_counts: dict[str, float] = {}
    wallet_counts: dict[str, float] = {}
    decline_counts: dict[str, float] = {}
    entry_auth: dict[str, dict[str, float]] = {}
    for w in year_weeks:
        for item in w["entry_method_mix"]:
            entry_counts[item["label"]] = entry_counts.get(item["label"], 0) + item["count"]
        for item in w["payment_type_mix"]:
            brand_counts[item["label"]] = brand_counts.get(item["label"], 0) + item["count"]
        for item in w.get("wallet_mix", []):
            wallet_counts[item["label"]] = wallet_counts.get(item["label"], 0) + item["count"]
        for item in w["decline_reasons"]:
            decline_counts[item["label"]] = decline_counts.get(item["label"], 0) + item["count"]
        for item in w.get("auth_rate_by_entry", []):
            bucket = entry_auth.setdefault(item["label"], {"approved_cnt": 0.0, "total_cnt": 0.0})
            bucket["approved_cnt"] += float(item["approved_cnt"])
            bucket["total_cnt"] += float(item["total_cnt"])

    auth_by_entry = [
        {
            "label": label,
            "auth_rate": _safe_div(vals["approved_cnt"], vals["total_cnt"]),
            "approved_cnt": vals["approved_cnt"],
            "total_cnt": vals["total_cnt"],
        }
        for label, vals in entry_auth.items()
    ]
    auth_by_entry.sort(key=lambda x: (-x["total_cnt"], x["label"]))

    histories = {
        key: [{"week_start": w["week_start"], "value": w["kpis"][key]["value"]} for w in year_weeks]
        for key in KPI_KEYS
    }
    values = {
        "auth_rate": _safe_div(auth_approved, auth_total),
        "aov": _safe_div(sales_amt, sales_cnt),
        "returns_pct_of_sales": _safe_div(return_amt, sales_amt),
        "sales_volume": sales_amt,
        "transaction_volume": sales_cnt,
        "ic_rate": _safe_div(sales_fee, sales_amt),
        "decline_volume": decline_amt,
        "ic_fee": sales_fee,
        "downgrade_rate": _safe_div(surcharged_amt, sales_amt),
    }

    return {
        "id": "ytd",
        "label": "YTD",
        "kpis": {
            key: {"value": values[key], "delta": None, "history": histories[key]} for key in KPI_KEYS
        },
        "entry_method_mix": _mix_from_counts(entry_counts),
        "payment_type_mix": _mix_from_counts(brand_counts),
        "wallet_mix": _mix_from_counts(wallet_counts),
        "auth_rate_by_entry": auth_by_entry,
        "decline_reasons": [
            {"label": k, "count": int(v)}
            for k, v in sorted(decline_counts.items(), key=lambda kv: -kv[1])
        ],
    }


def build_dashboard_payload(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    enriched = _enrich_weeks(weeks)
    return {
        "meta": {
            "channel": "In Shop · Worldpay",
            "scope": "Company owned shops only",
            "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
            "brand": {
                "blue": "#005F98",
                "red": "#D7282F",
                "yellow": "#FDE021",
                "dark": "#021521",
            },
        },
        "periods": {
            "weeks": enriched,
            "ytd": _ytd_from_weeks(enriched),
        },
    }
