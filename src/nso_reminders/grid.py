from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import pandas as pd

REQUIRED_COLUMNS = (
    "newco_id",
    "projected_opening",
    "first_tamper_check",
    "franchisee_operator",
    "city",
    "state",
)


@dataclass(frozen=True)
class ShopRow:
    newco_id: str
    projected_opening: date | None
    first_tamper_check: str
    franchisee_operator: str
    city: str
    state: str


def normalize_header(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip().lower()


def _pick(columns: list[str], predicate) -> str | None:
    for col in columns:
        if predicate(normalize_header(col)):
            return col
    return None


def map_headers(columns: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    mapping["newco_id"] = _pick(columns, lambda h: h == "newco id" or h.startswith("newco"))
    mapping["projected_opening"] = _pick(
        columns, lambda h: h.startswith("projected opening") and "turnover" not in h
    )
    mapping["first_tamper_check"] = _pick(columns, lambda h: "first tamper check" in h)
    mapping["franchisee_operator"] = _pick(
        columns,
        lambda h: h in {"franchisee/operator", "franchisee operator"}
        or h.startswith("franchisee/operat")
        or h.startswith("franchisee operat"),
    )
    mapping["city"] = _pick(columns, lambda h: h == "city")
    mapping["state"] = _pick(columns, lambda h: h == "state")

    missing = [k for k in REQUIRED_COLUMNS if not mapping.get(k)]
    if missing:
        raise ValueError(f"missing required columns: {', '.join(missing)}")
    return {k: mapping[k] for k in REQUIRED_COLUMNS}


_DATE_WITH_WEEKDAY = re.compile(
    r"^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})/(\d{1,2})/(\d{2,4})$",
    re.I,
)
_DATE_PLAIN = re.compile(r"^(\d{1,2})/(\d{1,2})/(\d{2,4})$")


def _year(yy: int) -> int:
    return yy if yy >= 100 else 2000 + yy


def parse_opening_date(value: object) -> date | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        parsed = pd.to_datetime(value, unit="D", origin="1899-12-30", errors="coerce")
        if pd.isna(parsed):
            return None
        return parsed.date()

    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "nat"}:
        return None

    m = _DATE_WITH_WEEKDAY.match(text) or _DATE_PLAIN.match(text)
    if m:
        mm, dd, yy = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return date(_year(yy), mm, dd)

    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def _as_str(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def load_projected_openings(path: Path) -> list[ShopRow]:
    df = pd.read_excel(path)
    mapping = map_headers([str(c) for c in df.columns])
    rows: list[ShopRow] = []
    for _, raw in df.iterrows():
        rows.append(
            ShopRow(
                newco_id=_as_str(raw[mapping["newco_id"]]),
                projected_opening=parse_opening_date(raw[mapping["projected_opening"]]),
                first_tamper_check=_as_str(raw[mapping["first_tamper_check"]]),
                franchisee_operator=_as_str(raw[mapping["franchisee_operator"]]),
                city=_as_str(raw[mapping["city"]]),
                state=_as_str(raw[mapping["state"]]),
            )
        )
    return rows
