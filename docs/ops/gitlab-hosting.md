# GitLab hosting (primary)

The dashboard lives in GitLab at
[gitlab.com/Krishna.Nagavolu/db-payments-space](https://gitlab.com/Krishna.Nagavolu/db-payments-space).
GitHub (`krishnanagavolu-db/repo_1`) stays as a backup until GitLab Pages is confirmed.

This is a **hosting move**, not a rebuild. `site/` is still the app. GitLab Pages
publishes that folder as `public/`.

## Use the URL GitLab prints (do not guess)

The GitLab username `Krishna.Nagavolu` contains a **dot**. GitLab’s default
`https://krishna.nagavolu.gitlab.io/…` name is **not valid HTTPS** (`*.gitlab.io`
does not cover that extra subdomain).

After the first green **pages** job:

1. Open the project → **Build → Pipelines** → latest pipeline on `main`.
2. Open the **pages** job log. The last lines include `GitLab Pages URL: …`
   (also shown as the job’s environment URL). That unique `*.gitlab.io` link is
   the one to share. It looks like
   `https://db-payments-space-<id>.gitlab.io/` (GitLab assigns the id).
3. Also check **Deploy → Pages** for the same URL.

| Audience | Path on that Pages URL |
| --- | --- |
| Leadership | `/` (site root) |
| Preview | `/preview/` |

GitHub backup (still live):

- https://krishnanagavolu-db.github.io/Repo_1/
- https://krishnanagavolu-db.github.io/Repo_1/preview/

## Two clicks so leadership can open the link

The GitLab project is private, so Pages may ask for a GitLab login until you
change this:

1. **Settings → General → Visibility, project features, permissions**
2. **Pages** access: **Everyone**
3. Save

The published site is still only the aggregates in `site/`. Raw Excels are not
copied to Pages.

## Optional: a cleaner URL later

To get a normal HTTPS path like
`https://db-payments.gitlab.io/db-payments-space/`
without a unique id:

1. In GitLab, **New group** named `db-payments` (no dot in the name).
2. **Transfer** this project into that group
   (Settings → General → Advanced → Transfer project).
3. Re-run the `main` pipeline. Share the new Pages URL from Deploy → Pages.

Do not rename the GitLab username unless you want every other GitLab link to change.

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
- Do not send people `https://krishna.nagavolu.gitlab.io/…` — browsers will reject the certificate.
