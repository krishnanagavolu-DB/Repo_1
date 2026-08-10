from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

import pandas as pd

from worldpay_dashboard.normalize import (
    canonical_card_brand,
    normalize_entry_method,
)

KPI_KEYS = [
    "auth_rate",
    "aov",
    "returns_pct_of_sales",
    "sales_volume",
    "transaction_volume",
    "ic_rate",
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


def compute_week_kpis(
    auth_df: pd.DataFrame, ix_df: pd.DataFrame, week_start: str
) -> dict[str, Any]:
    auth = auth_df.copy()
    ix = ix_df.copy()

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

    auth["Auth Response cd"] = _auth_cd(auth["Auth Response cd"])
    auth["Auth Request Cnt"] = pd.to_numeric(auth["Auth Request Cnt"], errors="coerce").fillna(0)
    auth_total = float(auth["Auth Request Cnt"].sum())
    auth_approved = float(
        auth.loc[auth["Auth Response cd"] == "00", "Auth Request Cnt"].sum()
    )
    auth_rate = _safe_div(auth_approved, auth_total)

    declines = auth.loc[auth["Auth Response cd"] != "00"].copy()
    resp = declines["Auth Response"].astype(str).str.strip()
    declines = declines.loc[~resp.isin(["", ".", "nan", "None"])].copy()
    decline_grouped = (
        declines.groupby("Auth Response", dropna=False)["Auth Request Cnt"].sum().sort_values(ascending=False)
    )
    decline_reasons = [
        {"label": str(label), "count": int(cnt)} for label, cnt in decline_grouped.items()
    ]

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

    sales["entry_method"] = sales["Entry Mode"].map(normalize_entry_method)
    sales["card_brand"] = sales["Card Type"].map(canonical_card_brand)

    entry_counts = sales.groupby("entry_method")["Transaction Cnt"].sum().to_dict()
    brand_counts = sales.groupby("card_brand")["Transaction Cnt"].sum().to_dict()

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
        },
        "totals": {
            "auth_approved_cnt": auth_approved,
            "auth_total_cnt": auth_total,
            "sales_amt": sales_amt,
            "sales_cnt": sales_cnt,
            "sales_fee": sales_fee,
            "return_amt": return_amt,
            "return_cnt": float(returns["Transaction Cnt"].sum()),
        },
        "entry_method_mix": _mix_from_counts(entry_counts),
        "payment_type_mix": _mix_from_counts(brand_counts),
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
                "decline_reasons": w["decline_reasons"],
                "totals": w["totals"],
            }
        )
    return enriched


def _ytd_from_weeks(weeks: list[dict[str, Any]]) -> dict[str, Any]:
    if not weeks:
        return {
            "id": "ytd",
            "label": "YTD",
            "kpis": {k: {"value": 0.0, "delta": None, "history": []} for k in KPI_KEYS},
            "entry_method_mix": [],
            "payment_type_mix": [],
            "decline_reasons": [],
        }

    year = date.fromisoformat(weeks[-1]["week_start"]).year
    year_weeks = [w for w in weeks if date.fromisoformat(w["week_start"]).year == year]
    # Prefer enriched weeks' totals from raw — enriched keeps totals
    auth_approved = sum(w["totals"]["auth_approved_cnt"] for w in year_weeks)
    auth_total = sum(w["totals"]["auth_total_cnt"] for w in year_weeks)
    sales_amt = sum(w["totals"]["sales_amt"] for w in year_weeks)
    sales_cnt = sum(w["totals"]["sales_cnt"] for w in year_weeks)
    sales_fee = sum(w["totals"]["sales_fee"] for w in year_weeks)
    return_amt = sum(w["totals"]["return_amt"] for w in year_weeks)

    # Re-aggregate mixes/declines by summing counts across weeks
    entry_counts: dict[str, float] = {}
    brand_counts: dict[str, float] = {}
    decline_counts: dict[str, float] = {}
    for w in year_weeks:
        for item in w["entry_method_mix"]:
            entry_counts[item["label"]] = entry_counts.get(item["label"], 0) + item["count"]
        for item in w["payment_type_mix"]:
            brand_counts[item["label"]] = brand_counts.get(item["label"], 0) + item["count"]
        for item in w["decline_reasons"]:
            decline_counts[item["label"]] = decline_counts.get(item["label"], 0) + item["count"]

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
    }

    return {
        "id": "ytd",
        "label": "YTD",
        "kpis": {
            key: {"value": values[key], "delta": None, "history": histories[key]} for key in KPI_KEYS
        },
        "entry_method_mix": _mix_from_counts(entry_counts),
        "payment_type_mix": _mix_from_counts(brand_counts),
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
