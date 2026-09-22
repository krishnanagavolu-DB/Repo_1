# GitLab hosting (primary)

The dashboard lives in GitLab at
[gitlab.com/Krishna.Nagavolu/db-payments-space](https://gitlab.com/Krishna.Nagavolu/db-payments-space).
GitHub (`krishnanagavolu-db/repo_1`) stays as a backup until GitLab Pages is confirmed.

This is a **hosting move**, not a rebuild. `site/` is still the app. GitLab Pages
publishes that folder as `public/`.

## URLs

| Audience | URL |
| --- | --- |
| Leadership | https://krishna.nagavolu.gitlab.io/db-payments-space/ |
| Preview | https://krishna.nagavolu.gitlab.io/db-payments-space/preview/ |
| GitLab project | https://gitlab.com/Krishna.Nagavolu/db-payments-space |

If the Pages URL 404s after the first green `pages` job, wait a few minutes, then
hard-refresh. GitLab prints the exact URL on **Deploy → Pages**.

## One-time GitLab settings

1. **CI/CD** is on by default. The first push to `main` that includes `.gitlab-ci.yml`
   runs the `pages` job.
2. If the project is **private**, leadership cannot log in to GitLab. Set
   **Settings → General → Visibility, project features, permissions → Pages → Everyone**.
   The site is still only the aggregates in `site/`; raw Excels are not published.
3. Do **not** change the Pages source folder. The pipeline copies `site/` → `public/`.

## Weekly publish

Same workflow as before: ingest → commit certified JSON → **push `main`**.

Push `main` to **both** remotes until GitHub is retired:

```bash
git push origin main
git push gitlab main
```

Cursor cloud `origin` is still GitHub. After GitLab Pages is the link you share,
we can retarget `origin` to GitLab.

## What not to do

- Do not rebuild the dashboard for GitLab.
- Do not publish `data/raw/`.
- Do not overwrite leadership `site/index.html` from preview unless you say **promote**.
