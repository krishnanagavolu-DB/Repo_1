#!/usr/bin/env python3
"""Encrypt data/processed JSON into site/**/data envelopes, or check they match."""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from payload_crypto import check_site_payloads, encrypt_site_payloads  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--password",
        default=os.environ.get("DASHBOARD_PASSWORD", ""),
        help="Gate password (or set DASHBOARD_PASSWORD). Required unless --check.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify published envelopes match processed plaintext hashes (no password).",
    )
    args = parser.parse_args()

    if args.check:
        problems = check_site_payloads()
        if problems:
            print("Published payloads are not encrypted copies of data/processed:", file=sys.stderr)
            for item in problems:
                print(f"  {item}", file=sys.stderr)
            return 1
        print("Published payloads are encrypted and match data/processed.")
        return 0

    if not args.password:
        print("Pass --password or set DASHBOARD_PASSWORD.", file=sys.stderr)
        return 1
    for line in encrypt_site_payloads(args.password):
        print(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
