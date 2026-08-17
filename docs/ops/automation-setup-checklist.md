# Minimum clicks — make Monday refresh automatic

You only need to do the steps below. Everything else is already written for you.
Do **not** invent settings. Copy/paste exactly.

Why the agent cannot finish this alone:
- Creating a Cursor Automation requires **your** Cursor account UI
- SharePoint access requires **your** Microsoft login (or IT credentials)
- Those logins cannot be completed from the cloud agent machine

---

## Your work (about 5 minutes)

### Click 1 — Connect SharePoint
1. Open Cursor on your computer
2. Go to **Dashboard → Integrations & MCP** (or **Settings → MCP**)
3. Add / enable a **SharePoint** or **Microsoft 365 / Graph** MCP  
   (Marketplace options like **Composio** also work if they list SharePoint)
4. When the browser pops up, sign in with **your `@dutchbros.com` account**
5. Allow read access when Microsoft asks
6. Reply in chat: **“SharePoint MCP connected”**

If Microsoft blocks you or asks for admin approval → stop and forward
`docs/ops/it-sharepoint-access-request.md` to Tech Help. Do not keep trying random settings.

### Click 2 — Create the Automation
1. Open: https://cursor.com/automations/new
2. Name: `Worldpay Monday KPI refresh`
3. Trigger: **Scheduled**
4. Cron (paste exactly):

```text
CRON_TZ=America/Los_Angeles 0 11 * * 1
```

5. Repository: attach **Repo_1** (`krishnanagavolu-DB/Repo_1`)
6. Tools: turn ON the SharePoint MCP + pull request creation
7. Prompt: open `docs/ops/monday-automation-prompt.txt` and paste the **entire** file
8. Save / Activate
9. Click **Run now** once

### Click 3 — Tell the agent
Reply in chat with either:
- **“Run now succeeded”** (and the PR link if shown), or
- paste any error text / screenshot description

The agent will verify the PR, fix anything that failed, and finish the ingest.

---

## What you should NOT do
- Do not change the cron string
- Do not change the SharePoint folder URL
- Do not edit ingest scripts
- Do not merge a data PR until the agent says it passed certification
