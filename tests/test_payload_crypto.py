"""Round-trip and publish checks for encrypted dashboard payloads."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import payload_crypto  # noqa: E402
from payload_crypto import (  # noqa: E402
    PAYLOAD_MAP,
    PRIVATE_PAYLOAD_MAP,
    check_site_payloads,
    decrypt_envelope,
    encrypt_bytes,
    encrypt_site_payloads,
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


def _isolated_maps(monkeypatch, tmp_path: Path):
    public_src = tmp_path / "public.json"
    private_src = tmp_path / "private.json"
    public_src.write_text('{"a": 1}')
    private_src.write_text('{"updates": []}')
    public_dest = tmp_path / "site" / "public.json"
    private_dest = tmp_path / "site" / "private.json"
    monkeypatch.setattr(payload_crypto, "ROOT", tmp_path)
    monkeypatch.setattr(payload_crypto, "PAYLOAD_MAP", ((public_src, (public_dest,)),))
    monkeypatch.setattr(payload_crypto, "PRIVATE_PAYLOAD_MAP", ((private_src, (private_dest,)),))
    return public_dest, private_dest


def test_private_payload_is_skipped_without_its_own_password(monkeypatch, tmp_path: Path):
    public_dest, private_dest = _isolated_maps(monkeypatch, tmp_path)
    log = encrypt_site_payloads("dashboard-key")
    assert public_dest.is_file()
    assert not private_dest.exists()
    assert any("skipped" in line for line in log)


def test_private_payload_opens_only_with_its_own_password(monkeypatch, tmp_path: Path):
    _, private_dest = _isolated_maps(monkeypatch, tmp_path)
    encrypt_site_payloads("dashboard-key", "private-key")
    envelope = json.loads(private_dest.read_text())
    assert decrypt_envelope(envelope, "private-key") == b'{"updates": []}'
    try:
        decrypt_envelope(envelope, "dashboard-key")
    except Exception:
        return
    raise AssertionError("the dashboard key opened the private payload")


def test_private_password_must_differ_from_dashboard_key(monkeypatch, tmp_path: Path):
    _isolated_maps(monkeypatch, tmp_path)
    try:
        encrypt_site_payloads("same-key", "same-key")
    except ValueError:
        return
    raise AssertionError("private payload was encrypted with the dashboard key")


def test_db_payments_is_a_private_payload():
    sources = {source.name for source, _ in PRIVATE_PAYLOAD_MAP}
    assert sources == {"db_payments.json"}
    assert "db_payments.json" not in {source.name for source, _ in PAYLOAD_MAP}


def test_published_envelopes_are_not_plaintext_metrics():
    for source, destinations in PAYLOAD_MAP + PRIVATE_PAYLOAD_MAP:
        if not source.is_file():
            continue
        for dest in destinations:
            payload = json.loads(dest.read_text(encoding="utf-8"))
            assert is_envelope(payload), dest
            assert "weeks" not in payload
            assert "periods" not in payload
            assert "SALES_VOLUME" not in dest.read_text(encoding="utf-8")
