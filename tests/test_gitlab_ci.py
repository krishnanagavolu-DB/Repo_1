"""The Pages pipeline config must survive GitLab's own YAML parse.

An unquoted `echo "Label: $VAR"` inside a script list is not a string to YAML:
the `: ` turns that list item into a mapping, and GitLab rejects the pipeline
with "jobs:pages:script config should be a string or a nested array of strings"
before it creates a single job. That mistake has reached main twice, and it
cannot be caught by running the shell commands locally.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
CI_FILE = ROOT / ".gitlab-ci.yml"
SCRIPT_KEYS = ("script", "before_script", "after_script")


def pipeline() -> dict:
    return yaml.safe_load(CI_FILE.read_text(encoding="utf-8"))


def job_items() -> list[tuple[str, dict]]:
    return [(name, body) for name, body in pipeline().items() if isinstance(body, dict)]


def test_pipeline_file_exists():
    assert CI_FILE.is_file(), "GitLab Pages deploys from .gitlab-ci.yml"


@pytest.mark.parametrize("name,body", job_items(), ids=lambda value: value if isinstance(value, str) else "")
def test_every_script_line_parses_as_a_string(name: str, body: dict):
    for key in SCRIPT_KEYS:
        lines = body.get(key)
        if lines is None:
            continue
        assert isinstance(lines, list), f"{name}:{key} must be a list of strings"
        for index, line in enumerate(lines):
            assert isinstance(line, str), (
                f"{name}:{key}[{index}] parsed as {type(line).__name__}, not a string. "
                'Quote the whole command when it contains ": " — '
                "GitLab refuses the pipeline before any job runs."
            )


def test_pages_job_publishes_only_the_site_folder():
    pages = pipeline()["pages"]
    joined = " ".join(pages["script"])
    assert "public" in joined
    assert "data/raw" not in joined
    assert pages["artifacts"]["paths"] == ["public"]
