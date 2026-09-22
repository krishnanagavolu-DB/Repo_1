#!/usr/bin/env python3
"""Set the dashboard gate password and re-encrypt published JSON with it."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from payload_crypto import encrypt_site_payloads  # noqa: E402

DEFAULT_CONFIGS = [
    ROOT / "site" / "auth-config.json",
    ROOT / "site" / "preview" / "auth-config.json",
]


def write_hash(config_path: Path, password: str) -> None:
    if config_path.exists():
        data = json.loads(config_path.read_text(encoding="utf-8"))
    else:
        data = {"sessionKey": "db_wp_dashboard_auth_v1"}

    data["passwordHash"] = hashlib.sha256(password.encode("utf-8")).hexdigest()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated password hash in {config_path}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Set the dashboard access password and encrypt published metrics."
    )
    parser.add_argument("password", help="New password (exact string to type in the gate)")
    parser.add_argument(
        "--config",
        type=Path,
        action="append",
        default=None,
        help="Path to auth-config.json (repeatable; default: leadership + preview)",
    )
    parser.add_argument(
        "--skip-encrypt",
        action="store_true",
        help="Update hashes only (not for publish; published JSON would stay on the old key)",
    )
    args = parser.parse_args()

    if not args.password:
        print("Password cannot be empty.", file=sys.stderr)
        return 1

    configs = args.config or DEFAULT_CONFIGS
    for path in configs:
        write_hash(path.resolve(), args.password)

    if not args.skip_encrypt:
        for line in encrypt_site_payloads(args.password):
            print(line)

    print("Commit auth-config.json and site/**/data/*.json, then push to publish.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
