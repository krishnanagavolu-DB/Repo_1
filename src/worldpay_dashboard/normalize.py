from __future__ import annotations

import re
from datetime import datetime, timedelta

_WALLET_CANON = {
    "apple pay": "Apple Pay",
    "android pay (google)": "Android Pay (Google)",
    "samsung pay": "Samsung Pay",
    "garmin pay": "Garmin Pay",
    "fitbit": "Fitbit",
    "bronco": "Bronco",
}

_NETWORK = {
    "mc": "Mastercard",
    "mastercard": "Mastercard",
    "visa": "Visa",
    "amex": "Amex",
    "discover": "Discover",
}

_ENTRY = {
    "7": "Contactless",
    "07": "Contactless",
    "5": "Chip / Dip",
    "05": "Chip / Dip",
    "90": "Swipe",
    "1": "Key entered",
    "01": "Key entered",
    "80": "Other",
    "85": "Other",
}


def normalize_wallet(value: object) -> str:
    if value is None:
        return "Card / Other"
    s = str(value).strip()
    if s == "" or s == ".":
        return "Card / Other"
    if re.fullmatch(r"\d+", s):
        return "Other wallet"
    key = s.lower()
    if key in _WALLET_CANON:
        return _WALLET_CANON[key]
    return s.title()


def normalize_network(value: object) -> str:
    if value is None:
        return "Other"
    key = str(value).strip().lower()
    return _NETWORK.get(key, str(value).strip().title())


def normalize_entry_method(code: object) -> str:
    if code is None:
        return "Other"
    raw = str(code).strip()
    if raw in _ENTRY:
        return _ENTRY[raw]
    if raw.isdigit():
        return _ENTRY.get(str(int(raw)), "Other")
    return "Other"


def week_start_from_report_stamp(stamp: str) -> str:
    delivery = datetime.strptime(stamp, "%Y%m%d").date()
    monday_of_delivery_week = delivery - timedelta(days=delivery.weekday())
    prior_monday = monday_of_delivery_week - timedelta(days=7)
    return prior_monday.isoformat()


def canonical_card_brand(value: object) -> str:
    return normalize_network(value)
