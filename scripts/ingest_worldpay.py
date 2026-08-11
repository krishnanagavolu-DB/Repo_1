#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from worldpay_dashboard.ingest import ingest_raw_tree  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest Worldpay weekly Excels into dashboard.json")
    parser.add_argument("--raw", type=Path, default=ROOT / "data" / "raw")
    parser.add_argument("--out", type=Path, default=ROOT / "data" / "processed" / "dashboard.json")
    parser.add_argument(
        "--site-copy",
        type=Path,
        action="append",
        default=None,
        help="Copy dashboard.json to a site path (repeatable; e.g. leadership + preview)",
    )
    args = parser.parse_args()

    out = ingest_raw_tree(args.raw.resolve(), args.out.resolve())
    copies = args.site_copy or []
    for site_path in copies:
        dest = site_path.resolve()
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out, dest)
        print(f"Copied to {dest}")
    print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
