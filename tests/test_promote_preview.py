"""Guard the preview → leadership copy so a promote cannot wipe branding."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from promote_preview import LEADERSHIP_TITLE, promote  # noqa: E402


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def _mini_site(tmp: Path) -> Path:
    preview = tmp / "site" / "preview"
    live = tmp / "site"
    _write(
        preview / "index.html",
        """<!DOCTYPE html>
<title>PREVIEW · Dutch Bros Payments Executive KPI Dashboard</title>
<link rel="stylesheet" href="css/dashboard.css?v=old" />
<script src="js/dashboard.js?v=old"></script>
<div class="preview-banner">Preview only</div>
<div class="eyebrow">Payments · Preview</div>
""",
    )
    _write(
        live / "index.html",
        """<!DOCTYPE html>
<title>Dutch Bros · Payments Executive KPI Dashboard</title>
<link rel="stylesheet" href="css/dashboard.css?v=old" />
<script src="js/dashboard.js?v=old"></script>
<div class="eyebrow">Payments</div>
""",
    )
    _write(preview / "css" / "dashboard.css", ":root { --blue: #006098; }")
    _write(live / "css" / "dashboard.css", ":root { --blue: #005f98; }")
    _write(
        preview / "js" / "dashboard.js",
        'const HINT = "site/preview/data/dashboard.json";\n',
    )
    _write(live / "js" / "dashboard.js", 'const HINT = "site/data/dashboard.json";\n')
    _write(preview / "js" / "pos-sales.js", "/* preview */\n")
    _write(live / "js" / "pos-sales.js", "/* live */\n")
    _write(preview / "assets" / "mark.txt", "preview-logo\n")
    _write(live / "assets" / "mark.txt", "old-logo\n")
    _write(preview / "auth-config.json", '{"preview": true}')
    _write(live / "auth-config.json", '{"preview": false}')
    _write(preview / "data" / "dashboard.json", '{"week": "preview"}')
    _write(live / "data" / "dashboard.json", '{"week": "live"}')
    return tmp


def test_promote_copies_css_js_assets_but_not_html_data_or_auth(tmp_path: Path):
    root = _mini_site(tmp_path)
    log = promote(root)

    assert (root / "site" / "css" / "dashboard.css").read_text() == ":root { --blue: #006098; }"
    assert (root / "site" / "js" / "pos-sales.js").read_text() == "/* preview */\n"
    assert (root / "site" / "assets" / "mark.txt").read_text() == "preview-logo\n"
    html = (root / "site" / "index.html").read_text()
    assert LEADERSHIP_TITLE in html
    assert "preview-banner" not in html
    assert "PREVIEW ·" not in html
    assert "Payments · Preview" not in html
    assert (root / "site" / "auth-config.json").read_text() == '{"preview": false}'
    assert (root / "site" / "data" / "dashboard.json").read_text() == '{"week": "live"}'
    assert "site/data/dashboard.json" in (root / "site" / "js" / "dashboard.js").read_text()
    assert "site/preview/data" not in (root / "site" / "js" / "dashboard.js").read_text()
    assert any("copied" in line or "rewrote" in line or "stamped" in line for line in log)


def test_promote_refuses_without_preview_tree(tmp_path: Path):
    try:
        promote(tmp_path)
    except FileNotFoundError:
        return
    raise AssertionError("expected FileNotFoundError when preview is missing")
