---
name: hosting-gitlab-pages
description: Use when a team wants to host the Dutch Bros dashboard kit or another static site on GitLab Pages, share a gitlab.io URL, or copy a pages job without publishing raw data.
---

# Host the dashboard kit on GitLab Pages

Publish the **static folder only**. Do not guess the Pages URL. Do not copy extracts.

**Playbook:** `docs/dashboard-kit/GITLAB.md`  
**Job template:** `docs/dashboard-kit/gitlab-ci.yml`

## Do this

1. Put the dashboard files in git (the kit `starter/` folder, or their `site/`).
2. Copy `docs/dashboard-kit/gitlab-ci.yml` to the repo root as `.gitlab-ci.yml`. Point the `cp` line at the folder that contains `index.html`.
3. Job **must** be named `pages`. GitLab only publishes that job’s `public/` artifact.
4. Enable Pages: **Settings → General → Visibility → Pages**. Use **Everyone** if people without GitLab logins must open the link; the repo can stay private.
5. Push the default branch. Open the **pages** job log and copy **GitLab Pages URL** (`CI_PAGES_URL`). Share that unique `*.gitlab.io` host.

## Do not guess

If the GitLab username or group contains a **dot**, `https://name.with.dot.gitlab.io/…` is often **invalid HTTPS**. Always use the URL GitLab prints.

## Do not publish

Raw drops, processed workbooks, passwords, or anything outside the static site folder. `public/` should look like the starter: HTML, CSS, JS, logo, sample JSON.

## Common mistakes

| Mistake | Fix |
|---|---|
| Job not named `pages` | Rename it; Pages will not deploy |
| Copying the whole repo into `public/` | Copy only the site/starter directory |
| Sharing a guessed `gitlab.io` URL | Use the job log / Deploy → Pages |
| Pages 404 for guests | Set Pages access to Everyone, or invite them as Guest |
