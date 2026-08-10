from pathlib import Path

import pandas as pd

from worldpay_dashboard.kpis import build_dashboard_payload, compute_week_kpis

FIX = Path(__file__).parent / "fixtures"


def _frames():
    auth = pd.read_csv(FIX / "mini_auth.csv")
    ix = pd.read_csv(FIX / "mini_ix.csv")
    return auth, ix


def test_auth_rate_and_aov_and_ic():
    auth, ix = _frames()
    week = compute_week_kpis(auth, ix, "2026-08-03")
    assert week["kpis"]["auth_rate"] == 140 / 150
    assert round(week["kpis"]["aov"], 4) == round(1400 / 100, 4)
    assert week["kpis"]["sales_volume"] == 1400
    assert week["kpis"]["transaction_volume"] == 100
    assert week["kpis"]["returns_pct_of_sales"] == 10 / 1400
    assert week["kpis"]["ic_rate"] == 30 / 1400


def test_mixes_and_declines():
    auth, ix = _frames()
    week = compute_week_kpis(auth, ix, "2026-08-03")
    assert week["entry_method_mix"][0]["label"] == "Contactless"
    assert week["payment_type_mix"][0]["label"] == "Visa"
    assert any(d["label"] == "Do not honor" for d in week["decline_reasons"])


def test_payload_periods_and_ytd():
    auth, ix = _frames()
    w1 = compute_week_kpis(auth, ix, "2026-07-20")
    w2 = compute_week_kpis(auth, ix, "2026-08-03")
    payload = build_dashboard_payload([w1, w2])
    assert payload["meta"]["channel"] == "In Shop · Worldpay"
    assert payload["meta"]["scope"] == "Company owned shops only"
    assert "ytd" in payload["periods"]
    assert len(payload["periods"]["weeks"]) == 2
    # enriched kpi objects for UI
    assert "value" in payload["periods"]["weeks"][0]["kpis"]["auth_rate"]
    assert "history" in payload["periods"]["weeks"][0]["kpis"]["auth_rate"]
