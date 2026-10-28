"""Encrypt published dashboard JSON so Pages can be public without leaking numbers.

Plaintext lives in data/processed/. site/**/data/*.json is an AES-GCM envelope
opened in the browser with the same password as the access gate.
"""
from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.backends import default_backend

ENC_VERSION = "db-dash-v1"
KDF_NAME = "PBKDF2-SHA256"
ITERATIONS = 210_000
SALT_LEN = 16
IV_LEN = 12
KEY_LEN = 32
AAD = ENC_VERSION.encode("utf-8")

ROOT = Path(__file__).resolve().parents[1]

# Plaintext source of truth → published envelopes. Olo Pay is preview-only.
PAYLOAD_MAP: tuple[tuple[Path, tuple[Path, ...]], ...] = (
    (
        ROOT / "data" / "processed" / "dashboard.json",
        (
            ROOT / "site" / "data" / "dashboard.json",
            ROOT / "site" / "preview" / "data" / "dashboard.json",
        ),
    ),
    (
        ROOT / "data" / "processed" / "in_shop_sales_data.json",
        (
            ROOT / "site" / "data" / "in_shop_sales_data.json",
            ROOT / "site" / "preview" / "data" / "in_shop_sales_data.json",
        ),
    ),
    (
        ROOT / "data" / "processed" / "benchmarks.json",
        (
            ROOT / "site" / "data" / "benchmarks.json",
            ROOT / "site" / "preview" / "data" / "benchmarks.json",
        ),
    ),
    (
        ROOT / "data" / "processed" / "olo_pay_data.json",
        (ROOT / "site" / "preview" / "data" / "olo_pay_data.json",),
    ),
    (
        ROOT / "data" / "processed" / "payment_devices.json",
        (ROOT / "site" / "preview" / "data" / "payment_devices.json",),
    ),
    (
        ROOT / "data" / "processed" / "e235_roadmap.json",
        (ROOT / "site" / "preview" / "data" / "e235_roadmap.json",),
    ),
    (
        ROOT / "data" / "processed" / "nso_health.json",
        (ROOT / "site" / "preview" / "data" / "nso_health.json",),
    ),
)

# Opened with a second password (DB_PAYMENTS_PASSWORD), never the dashboard key.
PRIVATE_PAYLOAD_MAP: tuple[tuple[Path, tuple[Path, ...]], ...] = (
    (
        ROOT / "data" / "processed" / "db_payments.json",
        (ROOT / "site" / "preview" / "data" / "db_payments.json",),
    ),
)


# Preview-only until the first certified drop is imported and encrypted.
OPTIONAL_PLAINTEXT = {
    ROOT / "data" / "processed" / "payment_devices.json",
}


def _pairs(mapping):
    for source, destinations in mapping:
        if source in OPTIONAL_PLAINTEXT and not source.is_file():
            continue
        yield source, destinations


def _payload_pairs():
    yield from _pairs(PAYLOAD_MAP)
    yield from _pairs(PRIVATE_PAYLOAD_MAP)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_envelope(payload: object) -> bool:
    if not isinstance(payload, dict):
        return False
    return payload.get("enc") == ENC_VERSION and "ciphertext" in payload and "salt" in payload


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _unb64(text: str) -> bytes:
    return base64.b64decode(text.encode("ascii"))


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=KEY_LEN,
        salt=salt,
        iterations=ITERATIONS,
        backend=default_backend(),
    )
    return kdf.derive(password.encode("utf-8"))


def encrypt_bytes(plaintext: bytes, password: str, *, salt: bytes | None = None, iv: bytes | None = None) -> dict:
    if not password:
        raise ValueError("password is required to encrypt published metrics")
    salt = salt or __import__("os").urandom(SALT_LEN)
    iv = iv or __import__("os").urandom(IV_LEN)
    key = _derive_key(password, salt)
    ciphertext = AESGCM(key).encrypt(iv, plaintext, AAD)
    return {
        "enc": ENC_VERSION,
        "alg": "AES-GCM",
        "kdf": KDF_NAME,
        "iterations": ITERATIONS,
        "salt": _b64(salt),
        "iv": _b64(iv),
        "sha256": sha256_hex(plaintext),
        "ciphertext": _b64(ciphertext),
    }


def decrypt_envelope(envelope: dict, password: str) -> bytes:
    if not is_envelope(envelope):
        raise ValueError("not a dashboard payload envelope")
    if int(envelope.get("iterations") or 0) != ITERATIONS:
        raise ValueError("unsupported KDF iterations")
    salt = _unb64(envelope["salt"])
    iv = _unb64(envelope["iv"])
    ciphertext = _unb64(envelope["ciphertext"])
    key = _derive_key(password, salt)
    plaintext = AESGCM(key).decrypt(iv, ciphertext, AAD)
    expected = envelope.get("sha256")
    if expected and sha256_hex(plaintext) != expected:
        raise ValueError("decrypted payload hash mismatch")
    return plaintext


def envelope_sha256(envelope: dict) -> str | None:
    if not is_envelope(envelope):
        return None
    value = envelope.get("sha256")
    return str(value) if value else None


def _write_envelopes(source: Path, destinations: tuple[Path, ...], password: str, log: list[str]) -> None:
    envelope = encrypt_bytes(source.read_bytes(), password)
    encoded = json.dumps(envelope, indent=2) + "\n"
    for dest in destinations:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(encoded, encoding="utf-8")
        log.append(f"encrypted {dest.relative_to(ROOT)}")


def encrypt_site_payloads(password: str, private_password: str | None = None) -> list[str]:
    """Encrypt every published payload.

    Private payloads need their own password. Without one they are left as-is,
    so a routine data refresh never re-keys them with the dashboard password.
    """
    log: list[str] = []
    for source, destinations in _pairs(PAYLOAD_MAP):
        _write_envelopes(source, destinations, password, log)
    for source, destinations in _pairs(PRIVATE_PAYLOAD_MAP):
        if not private_password:
            log.extend(f"skipped {dest.relative_to(ROOT)} (no private password)" for dest in destinations)
            continue
        if private_password == password:
            raise ValueError("the private payload password must differ from the dashboard password")
        _write_envelopes(source, destinations, private_password, log)
    return log


def check_site_payloads() -> list[str]:
    """Verify published files are envelopes whose sha256 matches processed bytes.

    Does not need the password. Catches a plaintext publish or a stale encrypt.
    """
    problems = []
    for source, destinations in _payload_pairs():
        if not source.is_file():
            problems.append(f"missing plaintext source {source.relative_to(ROOT)}")
            continue
        expected = sha256_hex(source.read_bytes())
        for dest in destinations:
            if not dest.is_file():
                problems.append(f"missing published envelope {dest.relative_to(ROOT)}")
                continue
            try:
                payload = json.loads(dest.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                problems.append(f"{dest.relative_to(ROOT)} is not JSON")
                continue
            if not is_envelope(payload):
                problems.append(f"{dest.relative_to(ROOT)} is not encrypted")
                continue
            digest = envelope_sha256(payload)
            if digest != expected:
                problems.append(
                    f"{dest.relative_to(ROOT)} hash {digest} does not match "
                    f"{source.relative_to(ROOT)} {expected}"
                )
    return problems
