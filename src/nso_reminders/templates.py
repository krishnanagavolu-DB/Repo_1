from __future__ import annotations

import re
from pathlib import Path

_PLACEHOLDER = re.compile(r"\{\{(\w+)\}\}")


def render_email(
    template_key: str, context: dict, templates_dir: Path
) -> tuple[str, str]:
    path = templates_dir / f"{template_key}.md"
    if not path.exists():
        raise FileNotFoundError(path)
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()
    if not lines or not lines[0].startswith("Subject:"):
        raise ValueError(f"template {template_key} must start with 'Subject:'")
    subject_raw = lines[0][len("Subject:") :].strip()
    body_raw = "\n".join(lines[2:] if len(lines) > 1 and lines[1] == "" else lines[1:])

    def _replace(fragment: str) -> str:
        def repl(match: re.Match[str]) -> str:
            key = match.group(1)
            if key not in context:
                raise KeyError(key)
            return str(context[key])

        return _PLACEHOLDER.sub(repl, fragment)

    return _replace(subject_raw), _replace(body_raw)
