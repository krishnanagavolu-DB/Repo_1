# Preview vs leadership page

We keep experimental dashboard changes on a **preview** URL until they are approved for leadership.

## Links

| Audience | URL | Files in repo |
| --- | --- | --- |
| **Leadership (live)** | https://krishnanagavolu-db.github.io/Repo_1/ | `site/index.html`, `site/css/`, `site/js/`, `site/data/` (root of `site/`) |
| **Preview (safe to change)** | https://krishnanagavolu-db.github.io/Repo_1/preview/ | `site/preview/` |

Pushing to `main` deploys the whole `site/` folder. Editing only files under `site/preview/` updates the preview link and **does not** change the leadership homepage.

## How we work

1. Make UI/chat/design changes under `site/preview/` only.
2. Open/merge a PR to `main`.
3. Review at the **preview** link.
4. When ready for leadership, say **promote** (or **publish to leadership**).
5. The agent runs `python3 scripts/promote_preview.py` (see
   `.cursor/skills/promoting-preview/SKILL.md`), which copies preview CSS/JS/assets
   onto `site/` **without** replacing the leadership HTML shell.

Password gate work also lands on preview first (see `docs/ops/password-gate.md`).

## Do not

- Merge redesigns that overwrite `site/index.html` until preview is approved.
- Share the preview link with leadership as the official scorecard (it’s labeled Preview).

## Weekly data refresh

Monday ingest should refresh **both** data copies when reports land:

- `site/data/dashboard.json` (leadership)
- `site/preview/data/dashboard.json` (preview)

So numbers stay aligned even while the preview UI differs.
