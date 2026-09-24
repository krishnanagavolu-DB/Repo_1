"""Every third-party import the repo uses must be declared in requirements.txt.

CI installs only requirements.txt, while a dev machine usually has extra
packages already present. That gap let an edit drop pandas, openpyxl, and
pytest from requirements while the full suite still passed locally; the Pages
pipeline then failed before it ran a single check.
"""

from __future__ import annotations

import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "requirements.txt"
SOURCE_DIRS = ("scripts", "src", "tests")

# Imported only by local tooling that CI never runs (screenshot capture needs a
# browser download). Keeping these out of requirements.txt keeps the deploy
# install small; listing them here documents the choice.
LOCAL_ONLY_IMPORTS = {"playwright"}


def declared_packages() -> set[str]:
    names = set()
    for line in REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        name = re.split(r"[<>=!~\[;]", line, maxsplit=1)[0].strip()
        if name:
            names.add(name.lower().replace("_", "-"))
    return names


def local_module_names() -> set[str]:
    names = {path.name for path in ROOT.iterdir() if path.is_dir()}
    for directory in SOURCE_DIRS:
        base = ROOT / directory
        if not base.is_dir():
            continue
        for path in base.rglob("*.py"):
            names.add(path.stem)
        for path in base.iterdir():
            if path.is_dir():
                names.add(path.name)
    return names


def imported_top_level_modules() -> set[str]:
    modules = set()
    for directory in SOURCE_DIRS:
        base = ROOT / directory
        if not base.is_dir():
            continue
        for path in base.rglob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        modules.add(alias.name.split(".")[0])
                elif isinstance(node, ast.ImportFrom):
                    if node.level == 0 and node.module:
                        modules.add(node.module.split(".")[0])
    return modules


def test_requirements_declares_every_third_party_import():
    third_party = (
        imported_top_level_modules()
        - set(sys.stdlib_module_names)
        - local_module_names()
        - LOCAL_ONLY_IMPORTS
    )
    missing = sorted(
        name for name in third_party if name.lower().replace("_", "-") not in declared_packages()
    )
    assert not missing, (
        "These packages are imported but missing from requirements.txt, so the "
        f"CI install will not have them:\n  " + "\n  ".join(missing)
    )


def test_requirements_keeps_the_packages_ci_cannot_run_without():
    """pytest and the ingest stack gate every publish, including data refreshes."""
    declared = declared_packages()
    for package in ("pytest", "pandas", "openpyxl", "cryptography"):
        assert package in declared, f"requirements.txt must declare {package}"
