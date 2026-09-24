"""Cache-busting guard.

Browsers key cached JS/CSS on the full URL including ?v=. If an asset changes
but its ?v= stamp does not, returning viewers keep running the old file and
never see the change. These tests fail when a stamp is stale, so the mistake
is caught in CI instead of by someone staring at an unchanged dashboard.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / "site" / "preview" / "index.html", ROOT / "site" / "index.html"]
ASSET_REF = re.compile(r'(?:src|href)="((?:js|css)/[A-Za-z0-9_.-]+\.(?:js|css))\?v=([A-Za-z0-9]+)"')

import sys

sys.path.insert(0, str(ROOT / "scripts"))
from stamp_asset_versions import asset_stamp, iter_asset_refs  # noqa: E402


def existing_pages() -> list[Path]:
    return [page for page in PAGES if page.is_file()]


def test_pages_exist():
    assert existing_pages(), "no dashboard pages found to check"


@pytest.mark.parametrize("page", existing_pages(), ids=lambda p: str(p.relative_to(ROOT)))
def test_every_asset_reference_is_stamped(page: Path):
    """Each local js/css reference must carry a ?v= stamp."""
    html = page.read_text()
    unstamped = re.findall(r'(?:src|href)="((?:js|css)/[A-Za-z0-9_.-]+\.(?:js|css))"', html)
    assert not unstamped, f"{page.name}: assets missing a ?v= stamp: {unstamped}"


@pytest.mark.parametrize("page", existing_pages(), ids=lambda p: str(p.relative_to(ROOT)))
def test_asset_stamps_match_file_contents(page: Path):
    """A changed asset must get a new stamp, or caches will serve the old file."""
    stale = []
    for ref, stamp in iter_asset_refs(page):
        asset = page.parent / ref
        if not asset.is_file():
            continue
        expected = asset_stamp(asset)
        if stamp != expected:
            stale.append(f"{ref} stamped {stamp}, content hash {expected}")
    assert not stale, (
        f"{page.name}: stale cache stamps; run "
        f"`python3 scripts/stamp_asset_versions.py`:\n  " + "\n  ".join(stale)
    )


@pytest.mark.parametrize("page", existing_pages(), ids=lambda p: str(p.relative_to(ROOT)))
def test_referenced_assets_exist(page: Path):
    missing = [ref for ref, _ in iter_asset_refs(page) if not (page.parent / ref).is_file()]
    assert not missing, f"{page.name}: references files that do not exist: {missing}"
