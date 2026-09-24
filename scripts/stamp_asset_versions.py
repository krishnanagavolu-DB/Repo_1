#!/usr/bin/env python3
"""Stamp js/css references with a content hash so browser caches refresh.

A hand-written ?v=20260818d is easy to forget when editing a script, and a
stale stamp means returning viewers keep running the cached old file. Deriving
the stamp from file contents makes it impossible to change an asset without
changing its URL.

Usage:
    python3 scripts/stamp_asset_versions.py           # rewrite stamps in place
    python3 scripts/stamp_asset_versions.py --check   # exit 1 if any are stale
"""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / "site" / "preview" / "index.html", ROOT / "site" / "index.html"]

ASSET_REF = re.compile(
    r'(?P<attr>src|href)="(?P<ref>(?:js|css)/[A-Za-z0-9_.-]+\.(?:js|css))(?:\?v=(?P<stamp>[A-Za-z0-9]+))?"'
)

STAMP_LENGTH = 10


def asset_stamp(path: Path) -> str:
    """Short content hash; changes whenever the file changes."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return digest[:STAMP_LENGTH]


def iter_asset_refs(page: Path):
    """Yield (relative_ref, current_stamp) for each local asset on the page."""
    for match in ASSET_REF.finditer(page.read_text()):
        yield match.group("ref"), match.group("stamp")


def restamp(page: Path) -> tuple[str, list[str]]:
    html = page.read_text()
    changed: list[str] = []

    def replace(match: re.Match) -> str:
        ref = match.group("ref")
        asset = page.parent / ref
        if not asset.is_file():
            return match.group(0)
        expected = asset_stamp(asset)
        if match.group("stamp") != expected:
            changed.append(f"{ref}: {match.group('stamp')} -> {expected}")
        return f'{match.group("attr")}="{ref}?v={expected}"'

    return ASSET_REF.sub(replace, html), changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report stale stamps without rewriting; exit 1 if any are found",
    )
    args = parser.parse_args()

    stale_total = 0
    for page in PAGES:
        if not page.is_file():
            continue
        updated, changed = restamp(page)
        label = page.relative_to(ROOT)
        if not changed:
            print(f"{label}: stamps current")
            continue
        stale_total += len(changed)
        for line in changed:
            print(f"{label}: {line}")
        if not args.check:
            page.write_text(updated)
            print(f"{label}: rewrote {len(changed)} stamp(s)")

    if args.check and stale_total:
        print(f"\n{stale_total} stale stamp(s). Run: python3 scripts/stamp_asset_versions.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
