from __future__ import annotations

from pathlib import Path

import pandas as pd


def normalize_person_name(name: str) -> str:
    return " ".join(str(name).split()).casefold()


def split_operator_names(raw: str) -> list[str]:
    if raw is None:
        return []
    text = str(raw).strip()
    if not text:
        return []
    parts = [p.strip() for p in text.split(",")]
    return [p for p in parts if p]


def load_email_cache(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    df = pd.read_excel(path)
    if df.empty:
        return {}
    cols = {str(c).strip().casefold(): c for c in df.columns}
    name_col = cols.get("name")
    email_col = cols.get("email")
    if name_col is None or email_col is None:
        raise ValueError("email cache must have Name and Email columns")
    cache: dict[str, str] = {}
    for _, row in df.iterrows():
        name = row[name_col]
        email = row[email_col]
        if pd.isna(name) or pd.isna(email):
            continue
        key = normalize_person_name(str(name))
        cache[key] = str(email).strip()
    return cache


def save_email_cache(path: Path, cache: dict[str, str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [{"Name": name, "Email": email} for name, email in sorted(cache.items())]
    pd.DataFrame(rows, columns=["Name", "Email"]).to_excel(path, index=False)


def resolve_from_cache(
    names: list[str], cache: dict[str, str]
) -> tuple[list[str], list[str]]:
    emails: list[str] = []
    missing: list[str] = []
    for name in names:
        key = normalize_person_name(name)
        hit = cache.get(key)
        if hit:
            emails.append(hit)
        else:
            missing.append(name)
    return emails, missing
