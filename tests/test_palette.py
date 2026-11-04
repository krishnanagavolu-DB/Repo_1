"""The preview palette has exactly one definition.

Chart colours had drifted: every chart script grew its own hex literals, and
`dashboard.css` accumulated fifteen near-identical blue-greys plus a teal and
two oranges that are not Dutch Theme colours. Nothing caught it because a
colour is never wrong enough to fail a test on its own.

These tests pin the two rules that keep it from happening again:

1. `dashboard.css` declares colours in `:root` and nowhere else.
2. Preview chart scripts only paint colours that `:root` already names.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
CSS = ROOT / "site" / "preview" / "css" / "dashboard.css"
JS_DIR = ROOT / "site" / "preview" / "js"

HEX = re.compile(r"#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b")

# White is the one literal worth leaving inline: it is not a brand decision,
# and naming it --white would add indirection without adding meaning.
ALLOWED_LITERALS = {"#fff", "#ffffff", "#111111"}


def normalize(value: str) -> str:
    text = value.strip().lower()
    if len(text) == 4:  # #abc -> #aabbcc
        text = "#" + "".join(char * 2 for char in text[1:])
    return text


def root_block() -> str:
    """The `:root { ... }` declaration block, which owns every brand value."""
    match = re.search(r":root\s*\{(.*?)\}", CSS.read_text(encoding="utf-8"), re.S)
    assert match, "dashboard.css must declare its palette in a :root block"
    return match.group(1)


def root_colors() -> set[str]:
    return {normalize(hex_value) for hex_value in HEX.findall(root_block())}


def css_outside_root() -> str:
    text = CSS.read_text(encoding="utf-8")
    return re.sub(r":root\s*\{.*?\}", "", text, count=1, flags=re.S)


def test_css_declares_every_colour_in_root():
    """A rule with its own hex is a colour nobody can find or change later."""
    stray = sorted(
        {
            normalize(value)
            for value in HEX.findall(css_outside_root())
            if normalize(value) not in ALLOWED_LITERALS
        }
    )
    assert not stray, (
        "dashboard.css paints colours outside :root; add a token and use var():\n  "
        + "\n  ".join(stray)
    )


@pytest.mark.parametrize("script", sorted(JS_DIR.glob("*.js")), ids=lambda p: p.name)
def test_chart_scripts_stay_inside_the_published_palette(script: Path):
    """A chart colour that :root does not name cannot be matched by the page."""
    allowed = root_colors() | ALLOWED_LITERALS
    stray = sorted(
        {
            normalize(value)
            for value in HEX.findall(script.read_text(encoding="utf-8"))
            if normalize(value) not in allowed
        }
    )
    assert not stray, (
        f"{script.name} paints colours the stylesheet never declares; either add a "
        "token to :root or reuse an existing one:\n  " + "\n  ".join(stray)
    )


def relative_luminance(hex_value: str) -> float:
    text = normalize(hex_value).lstrip("#")
    channels = []
    for offset in (0, 2, 4):
        part = int(text[offset : offset + 2], 16) / 255
        channels.append(part / 12.92 if part <= 0.03928 else ((part + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]


def contrast(first: str, second: str) -> float:
    high, low = sorted((relative_luminance(first), relative_luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def test_every_chart_slot_can_carry_a_readable_value_label():
    """Charts print values inside the slice, so each slot needs one good ink.

    A colour halfway between navy and white fails against both, which is how
    the decline chart ended up with white "450" on a pale blue bar.
    """
    navy = "#154167"
    white = "#ffffff"
    css = CSS.read_text(encoding="utf-8")
    names = re.findall(r"--chart-\d+:\s*(var\(--[\w-]+\)|#[0-9a-fA-F]{3,6})", root_block())
    assert names, "the chart ramp should be declared as --chart-N tokens"

    failures = []
    for raw in names:
        alias = re.fullmatch(r"var\((--[\w-]+)\)", raw)
        if alias:
            value = re.search(rf"{alias.group(1)}:\s*(#[0-9a-fA-F]{{3,6}})", root_block()).group(1)
        else:
            value = raw
        best = max(contrast(value, navy), contrast(value, white))
        if best < 4.5:
            failures.append(f"{raw} ({value}) reaches only {best:.2f}:1 with its best ink")
    assert not failures, "chart slots cannot label themselves legibly:\n  " + "\n  ".join(failures)


def test_label_ink_switches_at_the_real_crossover():
    """The threshold must be where navy and white contrast equally.

    Solving 1.05 / (L + 0.05) = (L + 0.05) / (navy + 0.05) gives ~0.273. The
    plugin used 0.45, which handed white to fills that navy suited better.
    """
    source = (JS_DIR / "chart-labels.js").read_text(encoding="utf-8")
    threshold = float(re.search(r"INK_CROSSOVER\s*=\s*([\d.]+)", source).group(1))
    exact = (1.05 * (relative_luminance("#154167") + 0.05)) ** 0.5 - 0.05
    assert abs(threshold - exact) < 0.01, f"{threshold} is not the {exact:.3f} crossover"


def test_root_has_no_duplicate_values_under_different_names():
    """Two names for one colour is how a palette starts drifting apart."""
    by_value: dict[str, list[str]] = {}
    for name, value in re.findall(r"(--[\w-]+):\s*(#[0-9a-fA-F]{3,8})", root_block()):
        by_value.setdefault(normalize(value), []).append(name)
    # --dark, --navy and --blue-deep are a deliberate alias set: the same ink
    # means "page text", "brand navy" and "the deep end of the blue ramp" in
    # different places, and collapsing them would lose that.
    aliases = {"--dark", "--navy", "--blue-deep"}
    duplicates = {
        value: names
        for value, names in by_value.items()
        if len(names) > 1 and not set(names) <= aliases
    }
    assert not duplicates, f"these tokens are the same colour twice: {duplicates}"
