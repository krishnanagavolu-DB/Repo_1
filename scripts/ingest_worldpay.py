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
    parser.add_argument("--site-copy", type=Path, default=None)
    args = parser.parse_args()

    out = ingest_raw_tree(args.raw.resolve(), args.out.resolve())
    if args.site_copy:
        site_path = args.site_copy.resolve()
        site_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(out, site_path)
        print(f"Wrote {out} and copied to {site_path}")
    else:
        print(f"Wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
