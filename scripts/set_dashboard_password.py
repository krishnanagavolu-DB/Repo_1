#!/usr/bin/env python3
"""Update the dashboard gate password hash (no plaintext stored in the site)."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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
        description="Set the dashboard access password (stores SHA-256 hash only)."
    )
    parser.add_argument("password", help="New password (exact string to type in the gate)")
    parser.add_argument(
        "--config",
        type=Path,
        action="append",
        default=None,
        help="Path to auth-config.json (repeatable; default: leadership + preview)",
    )
    args = parser.parse_args()

    if not args.password:
        print("Password cannot be empty.", file=sys.stderr)
        return 1

    configs = args.config or DEFAULT_CONFIGS
    for path in configs:
        write_hash(path.resolve(), args.password)

    print("Commit and push the updated auth-config.json file(s) to change the live gate password.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
