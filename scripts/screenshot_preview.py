#!/usr/bin/env python3
"""Render the preview dashboard to PNGs so design changes can be reviewed.

Serves site/preview over HTTP (fetch() will not work from file://), unlocks the
access gate by pre-seeding the session key, and captures each channel tab.

Usage:
    python3 scripts/screenshot_preview.py --out /tmp/shots
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import socketserver
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SITE = ROOT / "site" / "preview"


def serve(directory: Path) -> tuple[socketserver.TCPServer, int]:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(directory))
    handler.log_message = lambda *args, **kwargs: None  # type: ignore[assignment]
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, httpd.server_address[1]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", type=Path, default=DEFAULT_SITE)
    parser.add_argument("--out", type=Path, default=Path("/tmp/preview-shots"))
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=900)
    args = parser.parse_args()

    from playwright.sync_api import sync_playwright

    site = args.site.resolve()
    config = json.loads((site / "auth-config.json").read_text())
    session_key = config.get("sessionKey", "db_wp_dashboard_auth_v1")
    password_hash = config["passwordHash"]

    args.out.mkdir(parents=True, exist_ok=True)
    httpd, port = serve(site)
    base = f"http://127.0.0.1:{port}/index.html"
    errors: list[str] = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": args.width, "height": args.height})
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.add_init_script(
                f"sessionStorage.setItem({session_key!r}, {password_hash!r});"
            )
            page.goto(base, wait_until="networkidle")
            page.wait_for_timeout(900)

            for tab, name in (("pos", "all-payments"), ("worldpay", "card-present")):
                page.evaluate(f"window.__dashboardTabs.activate({tab!r})")
                page.wait_for_timeout(700)
                page.screenshot(path=str(args.out / f"{name}-top.png"))
                page.screenshot(path=str(args.out / f"{name}-full.png"), full_page=True)

            # The access gate is the first thing anyone sees, so capture it too.
            gate = browser.new_page(viewport={"width": args.width, "height": args.height})
            gate.goto(base, wait_until="networkidle")
            gate.wait_for_timeout(600)
            gate.screenshot(path=str(args.out / "access-gate.png"))

            browser.close()
    finally:
        httpd.shutdown()

    print(f"Wrote screenshots to {args.out}")
    for shot in sorted(args.out.glob("*.png")):
        print(f"  {shot.name}")
    if errors:
        print("\nConsole errors:")
        for error in errors:
            print(f"  {error}")
        return 1
    print("\nNo console errors.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
