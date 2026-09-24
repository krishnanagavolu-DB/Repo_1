"""The shareable dashboard kit must be branded, copyable, and data-free."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
KIT = ROOT / "docs" / "dashboard-kit"
SKILL = ROOT / ".cursor" / "skills" / "building-dutch-bros-dashboard" / "SKILL.md"
GITLAB_SKILL = ROOT / ".cursor" / "skills" / "hosting-gitlab-pages" / "SKILL.md"
SPEC = ROOT / "docs" / "superpowers" / "specs" / "2026-09-24-dashboard-kit-design.md"

FORBIDDEN_PATH_FRAGMENTS = (
    "data/processed",
    "data/raw",
    "site/preview/data",
    "site/data",
    "payment_devices.json",
    "in_shop_sales_data.json",
    "olo_pay_data.json",
    "dashboard.json",
)

FORBIDDEN_SECRETS = (
    "RebelEnergy",
    "DASHBOARD_PASSWORD",
    "M087-500-14-WWA",
)


def _kit_text() -> str:
    parts = []
    for path in KIT.rglob("*"):
        if path.is_file() and path.suffix in {".md", ".html", ".js", ".json", ".css"}:
            parts.append(path.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(parts)


def test_kit_files_exist():
    assert (KIT / "README.md").is_file()
    assert (KIT / "starter" / "index.html").is_file()
    assert (KIT / "starter" / "js" / "kit.js").is_file()
    assert (KIT / "starter" / "data" / "sample.json").is_file()
    assert (KIT / "starter" / "css" / "dashboard.css").is_file()
    assert (KIT / "starter" / "assets" / "dutchbros-logo.svg").is_file()
    assert SKILL.is_file()
    assert GITLAB_SKILL.is_file()
    assert SPEC.is_file()
    assert (KIT / "gitlab-ci.yml").is_file()
    assert (KIT / "GITLAB.md").is_file()
    assert (KIT / "skills" / "building-dutch-bros-dashboard" / "SKILL.md").is_file()
    assert (KIT / "skills" / "hosting-gitlab-pages" / "SKILL.md").is_file()


def test_sample_json_is_labeled_fiction():
    payload = json.loads((KIT / "starter" / "data" / "sample.json").read_text())
    assert payload["sample"] is True
    assert "not" in payload["disclaimer"].lower()
    assert payload["kpis"]
    assert payload["mix"]
    assert payload["reasons"]
    assert payload["trend"]


def test_kit_does_not_ship_production_payloads_or_secrets():
    names = [str(path.relative_to(ROOT)) for path in KIT.rglob("*") if path.is_file()]
    joined = "\n".join(names)
    for fragment in FORBIDDEN_PATH_FRAGMENTS:
        assert fragment not in joined
    text = _kit_text() + SKILL.read_text() + GITLAB_SKILL.read_text()
    for secret in FORBIDDEN_SECRETS:
        assert secret not in text


def test_theme_tokens_and_copy_instructions_are_present():
    playbook = (KIT / "README.md").read_text()
    css = (KIT / "starter" / "css" / "dashboard.css").read_text()
    html = (KIT / "starter" / "index.html").read_text()
    skill = SKILL.read_text()
    assert "#006098" in css and "#f6e300" in css.lower() and "futura-pt" in css
    assert 'data-tab=' in html and "chart-wrap" in html
    assert "doughnut" in playbook.lower() or "pie" in playbook.lower()
    assert "tabs" in playbook.lower()
    assert skill.startswith("---")
    assert "Use when" in skill
    assert "do not copy" in skill.lower() or "Do not copy" in skill


def test_starter_registers_tabs_and_uses_chart_js():
    html = (KIT / "starter" / "index.html").read_text()
    js = (KIT / "starter" / "js" / "kit.js").read_text()
    assert "chart.js" in html.lower()
    assert "tabs.js" in html
    assert "chart-labels.js" in html
    assert "registerPeriods" in js or "__dashboardTabs" in js
    assert "inlineValueLabels" in js


def test_gitlab_pages_skill_and_job_are_portable():
    skill = GITLAB_SKILL.read_text()
    ci = (KIT / "gitlab-ci.yml").read_text()
    guide = (KIT / "GITLAB.md").read_text()
    assert skill.startswith("---")
    assert "Use when" in skill
    assert "pages:" in ci
    assert "public" in ci
    assert "CI_PAGES_URL" in ci
    assert "data/raw" not in ci
    assert "gitlab.io" in guide.lower()
    assert "Everyone" in guide
    assert "do not guess" in skill.lower() or "Do not guess" in skill
