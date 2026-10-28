"""The 1-1 notes site keeps the agreed template and stays out of the public dashboard."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TEMPLATE = ROOT / "ravi-1-1" / "docs" / "templates" / "1-1-weekly-template.md"
GITLAB = (ROOT / ".gitlab-ci.yml").read_text(encoding="utf-8")

REQUIRED = [
    "# 1-1 Check-in: [Date]",
    "## 1. The Pre-Read (Sent 24 hours prior)",
    "**Top 3 Priorities This Week:**",
    "**Key Wins / Progress:**",
    "**Where I'm Stuck / Need Your Help:**",
    "### 0:00 - 0:05 | Settle In",
    "### 0:05 - 0:15 | Tactical Review",
    "### 0:15 - 0:25 | Blocker Resolution",
    "### 0:25 - 0:35 | Strategic Alignment & Peer Dynamics",
    "### 0:35 - 0:45 | Career Development (Check-in every 2-3 weeks)",
    "## 3. Action Items & Follow-ups",
    "**Krishna:**",
    "**Ravi:**",
]


def test_weekly_template_keeps_the_agreed_sections():
    text = TEMPLATE.read_text(encoding="utf-8")
    missing = [line for line in REQUIRED if line not in text]
    assert not missing, "template is missing:\n" + "\n".join(missing)


def test_1_1_notes_are_not_copied_onto_the_public_dashboard():
    pages = GITLAB.split("pages:", 1)[1]
    assert "ravi-1-1" not in pages
    assert "mkdocs" not in pages
