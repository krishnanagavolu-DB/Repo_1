"""Guards that keep local verification honest about what CI actually runs.

The Olo Pay tab shipped with a green local test run and still broke the Pages
deploy: `python3 -m pytest` puts the repo root on `sys.path`, bare `pytest`
does not, so `from scripts.import_olo_pay import ...` only resolved locally.
Collection failed in CI and blocked every publish, including data refreshes.

These tests fail on the difference itself rather than on its symptoms.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
TESTS = ROOT / "tests"
WORKFLOW = ROOT / ".github" / "workflows" / "deploy-pages.yml"
RUNNER = ROOT / "scripts" / "run_ci_checks.sh"

# `scripts/` holds standalone entrypoints and has no __init__.py, so a
# `scripts.` import only resolves when something has put the repo root on
# sys.path. Bare pytest never does.
SCRIPTS_PACKAGE_IMPORT = re.compile(r"^\s*(?:from\s+scripts\.|import\s+scripts\b)", re.MULTILINE)


def _python_test_modules() -> list[Path]:
    return sorted(TESTS.glob("test_*.py"))


@pytest.mark.skipif(
    sys.version_info < (3, 11), reason="PYTHONSAFEPATH is available from Python 3.11"
)
def test_suite_collects_without_the_repo_root_on_syspath():
    """CI runs the bare `pytest` entrypoint, which does not add the repo root.

    PYTHONSAFEPATH stops the interpreter prepending the working directory, so
    this subprocess sees the same sys.path CI does.
    """
    env = {**os.environ, "PYTHONSAFEPATH": "1"}
    env.pop("PYTHONPATH", None)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "-p", "no:cacheprovider"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
    )

    assert result.returncode == 0, (
        "Test collection fails the way CI runs pytest.\n"
        "A test module is importing something that only resolves when the repo "
        "root is on sys.path.\n\n"
        f"{result.stdout[-2000:]}\n{result.stderr[-2000:]}"
    )


def test_no_test_module_imports_the_scripts_package():
    """`scripts/` is not a package; import its modules by path like test_promote_preview."""
    offenders = [
        path.relative_to(ROOT)
        for path in _python_test_modules()
        if SCRIPTS_PACKAGE_IMPORT.search(path.read_text(encoding="utf-8"))
    ]
    assert not offenders, (
        "These test modules import the `scripts` package, which only works when the "
        "repo root is on sys.path (it is not under bare `pytest`):\n  "
        + "\n  ".join(str(path) for path in offenders)
        + "\n\nInstead add scripts/ to sys.path and import the module directly, as "
        "tests/test_promote_preview.py does."
    )


def _workflow_check_step() -> str:
    text = WORKFLOW.read_text(encoding="utf-8")
    start = text.index("Certify Worldpay data before publish")
    end = text.index("- uses: actions/configure-pages", start)
    return text[start:end]


def _node_smoke_commands(text: str) -> set[str]:
    return set(re.findall(r"node\s+(tests/[\w-]+\.js)", text))


def _python_check_scripts(text: str) -> set[str]:
    return set(re.findall(r"python3?\s+(scripts/[\w-]+\.py)", text))


def test_every_smoke_test_is_wired_into_ci():
    """A smoke test nobody runs is not a test."""
    on_disk = {f"tests/{path.name}" for path in TESTS.glob("*_smoke.js")}
    in_ci = _node_smoke_commands(_workflow_check_step())
    missing = sorted(on_disk - in_ci)
    assert not missing, (
        "These smoke tests exist but never run in CI. Add them to the "
        f"'Certify Worldpay data before publish' step in {WORKFLOW.relative_to(ROOT)}:\n  "
        + "\n  ".join(missing)
    )


def test_local_runner_exists_and_is_executable():
    """One command has to reproduce CI, or local verification drifts from it again."""
    assert RUNNER.is_file(), (
        f"{RUNNER.relative_to(ROOT)} is missing. It is the single command that "
        "reproduces the CI checks locally."
    )
    assert os.access(RUNNER, os.X_OK), f"{RUNNER.relative_to(ROOT)} must be executable."


def test_local_runner_matches_ci_checks():
    """Whatever CI gates on, the local runner must gate on too."""
    ci = _workflow_check_step()
    runner = RUNNER.read_text(encoding="utf-8")

    missing_smoke = sorted(_node_smoke_commands(ci) - _node_smoke_commands(runner))
    assert not missing_smoke, (
        f"{RUNNER.relative_to(ROOT)} skips smoke tests that CI runs:\n  "
        + "\n  ".join(missing_smoke)
    )

    missing_scripts = sorted(_python_check_scripts(ci) - _python_check_scripts(runner))
    assert not missing_scripts, (
        f"{RUNNER.relative_to(ROOT)} skips check scripts that CI runs:\n  "
        + "\n  ".join(missing_scripts)
    )


def _shell_invocations(script: str) -> list[str]:
    """Command lines only — comments and echoed help text are not invocations."""
    lines = []
    for raw in script.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        first = line.split()[0]
        if first in {"echo", "printf", ":"}:
            continue
        lines.append(line)
    return lines


def test_local_runner_uses_the_same_pytest_entrypoint_as_ci():
    """`python -m pytest` hides this whole class of bug. The runner must not use it."""
    invocations = _shell_invocations(RUNNER.read_text(encoding="utf-8"))
    runs_pytest = [line for line in invocations if re.match(r"^pytest\b", line)]
    assert runs_pytest, (
        f"{RUNNER.relative_to(ROOT)} must invoke the bare `pytest` entrypoint, as CI does."
    )

    module_form = [line for line in invocations if re.match(r"^python3?\s+-m\s+pytest\b", line)]
    assert not module_form, (
        "The local runner must call the bare `pytest` entrypoint, like CI does. "
        "`python -m pytest` silently prepends the repo root to sys.path and hides "
        "import errors that break the deploy:\n  " + "\n  ".join(module_form)
    )
