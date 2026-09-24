"""Round-trip and publish checks for encrypted dashboard payloads."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from payload_crypto import (  # noqa: E402
    PAYLOAD_MAP,
    check_site_payloads,
    decrypt_envelope,
    encrypt_bytes,
    is_envelope,
    sha256_hex,
)


def test_encrypt_decrypt_round_trip():
    plaintext = b'{"sales": 12.5}'
    envelope = encrypt_bytes(plaintext, "unit-test-key")
    assert is_envelope(envelope)
    assert envelope["sha256"] == sha256_hex(plaintext)
    assert decrypt_envelope(envelope, "unit-test-key") == plaintext


def test_wrong_password_does_not_open_payload():
    envelope = encrypt_bytes(b'{"secret": true}', "unit-test-key")
    try:
        decrypt_envelope(envelope, "other-key")
    except Exception:
        return
    raise AssertionError("wrong password opened the envelope")


def test_published_site_json_is_encrypted_and_matches_processed():
    problems = check_site_payloads()
    assert not problems, "\n".join(problems)


def test_published_envelopes_are_not_plaintext_metrics():
    for _source, destinations in PAYLOAD_MAP:
        for dest in destinations:
            payload = json.loads(dest.read_text(encoding="utf-8"))
            assert is_envelope(payload), dest
            assert "weeks" not in payload
            assert "periods" not in payload
            assert "SALES_VOLUME" not in dest.read_text(encoding="utf-8")
