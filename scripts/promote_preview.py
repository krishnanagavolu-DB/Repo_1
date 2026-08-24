#!/usr/bin/env python3
"""Copy approved preview UI onto the leadership homepage without wiping branding.

Usage:
    python3 scripts/promote_preview.py
    python3 scripts/promote_preview.py --root /path/to/repo
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from stamp_asset_versions import restamp  # noqa: E402

COPY_DIRS = ("css", "js", "assets")
SKIP_NAMES = {"index.html", "auth-config.json"}
LEADERSHIP_TITLE = "Dutch Bros · Payments Executive KPI Dashboard"

# Preview JS names the preview data folder in error copy. Leadership must not.
PATH_REWRITES = (
    ("site/preview/data/dashboard.json", "site/data/dashboard.json"),
    ("site/preview/data/in_shop_sales_data.json", "site/data/in_shop_sales_data.json"),
    (
        "python3 scripts/import_pos_sales.py &lt;path-to-export&gt; --preview-only",
        "python3 scripts/import_pos_sales.py &lt;path-to-export&gt;",
    ),
    (
        "to validate and copy it into the site data.",
        "to validate and copy it into both site data folders.",
    ),
)


def _copy_tree(src: Path, dest: Path, log: list[str]) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    for item in src.iterdir():
        if item.name in SKIP_NAMES:
            continue
        target = dest / item.name
        if item.is_dir():
            if item.name == "data":
                continue
            _copy_tree(item, target, log)
            continue
        shutil.copyfile(item, target)
        log.append(f"copied {item.relative_to(src.parents[1])}")


def _rewrite_leadership_js(js_dir: Path, log: list[str]) -> None:
    for path in js_dir.glob("*.js"):
        text = path.read_text()
        updated = text
        for old, new in PATH_REWRITES:
            updated = updated.replace(old, new)
        if updated != text:
            path.write_text(updated)
            log.append(f"rewrote paths in {path.name}")


def _assert_leadership_html(index: Path) -> None:
    html = index.read_text()
    problems = []
    if "preview-banner" in html:
        problems.append("leadership index.html still has the Preview banner")
    if "PREVIEW ·" in html:
        problems.append("leadership title still says PREVIEW")
    if "Payments · Preview" in html:
        problems.append("leadership eyebrow still says Preview")
    if LEADERSHIP_TITLE not in html:
        problems.append(f"leadership title must stay {LEADERSHIP_TITLE!r}")
    if problems:
        raise RuntimeError("Promote aborted: " + "; ".join(problems))


def promote(root: Path) -> list[str]:
    preview = root / "site" / "preview"
    live = root / "site"
    if not preview.is_dir():
        raise FileNotFoundError(f"missing preview tree: {preview}")
    if not (live / "index.html").is_file():
        raise FileNotFoundError(f"missing leadership index: {live / 'index.html'}")

    log: list[str] = []
    for name in COPY_DIRS:
        src = preview / name
        if not src.is_dir():
            continue
        _copy_tree(src, live / name, log)

    _rewrite_leadership_js(live / "js", log)
    _assert_leadership_html(live / "index.html")

    for page in (live / "index.html", preview / "index.html"):
        if not page.is_file():
            continue
        updated, changed = restamp(page)
        if changed:
            page.write_text(updated)
            log.append(f"stamped {page.relative_to(root)} ({len(changed)})")
    return log


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT, help="repository root")
    args = parser.parse_args()
    try:
        log = promote(args.root.resolve())
    except (FileNotFoundError, RuntimeError) as err:
        print(f"ERROR {err}")
        return 1
    if not log:
        print("Leadership already matches preview UI (css/js/assets).")
        return 0
    for line in log:
        print(line)
    print("\nPromote applied. Leadership HTML (title, no Preview banner) was left in place.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
