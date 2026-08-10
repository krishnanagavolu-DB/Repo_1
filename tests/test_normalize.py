from worldpay_dashboard.normalize import (
    normalize_wallet,
    normalize_network,
    normalize_entry_method,
    week_start_from_report_stamp,
    canonical_card_brand,
)


def test_wallet_casing_and_blanks():
    assert normalize_wallet("APPLE PAY") == "Apple Pay"
    assert normalize_wallet("Apple Pay") == "Apple Pay"
    assert normalize_wallet(None) == "Card / Other"
    assert normalize_wallet(".") == "Card / Other"
    assert normalize_wallet("40010080419") == "Other wallet"


def test_network_alignment():
    assert normalize_network("MC") == "Mastercard"
    assert normalize_network("MASTERCARD") == "Mastercard"
    assert normalize_network("VISA") == "Visa"


def test_entry_methods():
    assert normalize_entry_method("07") == "Contactless"
    assert normalize_entry_method(5) == "Chip / Dip"
    assert normalize_entry_method("90") == "Swipe"
    assert normalize_entry_method("01") == "Key entered"


def test_week_start_from_monday_delivery():
    assert week_start_from_report_stamp("20260810") == "2026-08-03"
    assert week_start_from_report_stamp("20260804") == "2026-07-27"
    assert week_start_from_report_stamp("20260730") == "2026-07-20"


def test_card_brand():
    assert canonical_card_brand("VISA") == "Visa"
    assert canonical_card_brand("AMEX") == "Amex"
