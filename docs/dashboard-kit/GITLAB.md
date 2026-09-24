# Host this kit on GitLab Pages

Use this when another team wants a shareable `*.gitlab.io` link for the branded starter page. Cursor skill: `.cursor/skills/hosting-gitlab-pages/SKILL.md` (a copy also lives in `docs/dashboard-kit/skills/`).

This is **hosting**, not a rebuild. Keep the HTML/CSS/JS. Do not upload workbooks.

## 1. Put the site in git

Either keep the kit layout (`docs/dashboard-kit/starter/index.html`) or move `starter/` to `site/` at the repo root. The Pages job copies **one folder** into `public/`.

## 2. Add the Pages job

Copy `docs/dashboard-kit/gitlab-ci.yml` to `.gitlab-ci.yml` at the repo root.

- The job **must** be named `pages`.
- Edit the `cp -a … public/` line so it points at the folder that contains `index.html`.
- If `starter/` **is** the repo root, use `cp -a ./index.html ./css ./js ./assets ./data public/` (or `rsync`) so `.gitlab-ci.yml` and `.git` are not published.

Push the default branch (`main`).

## 3. Copy the URL GitLab prints (do not guess)

Open **Build → Pipelines** → the **pages** job log. The line `GitLab Pages URL: …` is the link to share. **Deploy → Pages** shows the same host.

If the username or group contains a **dot**, the pretty URL `https://first.last.gitlab.io/project` is often **not valid HTTPS**. Use the unique host GitLab assigns (it looks like `https://project-<id>.gitlab.io/`).

| Audience | Path |
|---|---|
| Live dashboard | `/` (contents of `public/`) |
| A preview copy | `/preview/` only if you copied a preview folder into `public/preview/` |

## 4. Let people without GitLab logins open it (optional)

Private project + default Pages access looks like a **404** to guests (GitLab hides private Pages that way).

1. **Settings → General → Visibility, project features, permissions**
2. **Pages:** **Everyone**
3. Save

The git repo can stay private. Only `public/` is served.

## 5. Keep it out of search

The starter already has `noindex`. Add `public/robots.txt` with `User-agent: *` / `Disallow: /` if the URL should stay unlisted.

## Do not

- Publish spreadsheets, warehouse extracts, or `data/processed` trees
- Rebuild the page in a GitLab-only framework
- Send a guessed `gitlab.io` URL
- Treat a client-side password gate as server-side security unless you also encrypt published JSON
