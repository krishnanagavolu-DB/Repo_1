"""Guards for the publicly-shared Pages build.

Pages access is set to Everyone so people without GitLab accounts can open the
link. Public must not mean findable: these tests fail if the crawler blocks are
dropped, so the dashboard cannot drift into search results.
"""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / "site" / "index.html", ROOT / "site" / "preview" / "index.html"]
ROBOTS = ROOT / "site" / "robots.txt"


def existing_pages() -> list[Path]:
    return [page for page in PAGES if page.is_file()]


def test_robots_txt_is_published_at_the_domain_root():
    """robots.txt only applies at the root, which is where site/ is served."""
    assert ROBOTS.is_file(), "site/robots.txt is missing; the public site becomes crawlable"


def test_robots_txt_disallows_every_crawler():
    lines = [line.strip().lower() for line in ROBOTS.read_text().splitlines()]
    assert "user-agent: *" in lines
    assert "disallow: /" in lines


@pytest.mark.parametrize("page", existing_pages(), ids=lambda p: str(p.relative_to(ROOT)))
def test_page_asks_not_to_be_indexed(page: Path):
    html = page.read_text()
    assert 'name="robots"' in html and "noindex" in html, (
        f"{page.name}: missing a noindex robots meta tag"
    )
