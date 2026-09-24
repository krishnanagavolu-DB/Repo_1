from __future__ import annotations

import json
from pathlib import Path

_DEFAULT = Path(__file__).resolve().parents[2] / "config" / "nso-source.json"


def load_nso_config(path: Path | None = None) -> dict:
    cfg_path = path or _DEFAULT
    return json.loads(cfg_path.read_text(encoding="utf-8"))
