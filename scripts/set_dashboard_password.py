#!/usr/bin/env python3
"""Update the dashboard gate password hash (no plaintext stored in the site)."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "site" / "preview" / "auth-config.json"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Set the dashboard access password (stores SHA-256 hash only)."
    )
    parser.add_argument("password", help="New password (exact string to type in the gate)")
    parser.add_argument(
        "--config",
        type=Path,
        default=DEFAULT_CONFIG,
        help=f"Path to auth-config.json (default: {DEFAULT_CONFIG})",
    )
    args = parser.parse_args()

    if not args.password:
        print("Password cannot be empty.", file=sys.stderr)
        return 1

    config_path = args.config.resolve()
    if config_path.exists():
        data = json.loads(config_path.read_text(encoding="utf-8"))
    else:
        data = {"sessionKey": "db_wp_dashboard_auth_v1"}

    data["passwordHash"] = hashlib.sha256(args.password.encode("utf-8")).hexdigest()
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated password hash in {config_path}")
    print("Commit and push that file to change the live gate password.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
