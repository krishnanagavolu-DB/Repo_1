# Tech Help email — automated read access to one SharePoint folder

Copy everything below the line into an email or ticket.

---

**Subject:** Request: read-only automated access to one SharePoint folder (Payments KPI dashboard)

Hi Tech Help,

**What I need**

A weekly report process needs to read two Excel files from one SharePoint folder
automatically, without a person signing in each time.

**Why (business reason)**

Every Monday, Worldpay delivers two payment reports into a SharePoint folder our team
owns. Those reports feed the Payments KPI dashboard that leadership uses to monitor
card authorization rates, transaction volume, and processing costs for company-owned
shops.

Today someone has to manually move those two files every week for the dashboard to
update. That is a recurring manual task on a report leadership depends on, and it means
the dashboard is stale or missing if that person is out.

**What I'm asking for**

Read-only automated access to this one folder:

> Site: **CoreShopTech**
> Folder: **Shared Documents / General / Payment Systems / Reports / Worldpay / WP Weekly Reports**

Read and download only. No ability to write, delete, or change sharing, and no access
to any other SharePoint site or folder.

**Why my own login doesn't work**

I tried connecting with my Dutch Bros account and Conditional Access blocked it
(**error AADSTS53003**). My password and account were accepted — the policy rejected the
sign-in because of the app and device it came from. I have not tried to work around it.

A service account / app-based access is also the better long-term answer, because a
personal sign-in expires and would break the automation later.

**Preferred solution (details for whoever implements this)**

An Entra app registration using application permissions, so no user or device is
involved in the sign-in at all:

| Item | Value |
|---|---|
| Suggested name | `Payments KPI Dashboard - Worldpay Reader` |
| Permission | Microsoft Graph → **`Sites.Selected`** (application permission), admin consent |
| Scope | The single document library listed above, **read** role only |
| Credentials needed | Tenant id, client id, and client secret (or federated credential) |

If an app registration is not allowed, I'm open to whatever approved method you'd
prefer for reading that folder programmatically — I just need something that doesn't
depend on an interactive login.

**Sign-in error details (for lookup in Entra sign-in logs)**

| Field | Value |
|---|---|
| Error code | 53003 (BlockedByConditionalAccess) |
| App name attempted | Microsoft Azure CLI |
| App id | `04b07795-8ddb-461a-bbee-02f9e1bf7b46` |
| Request id | `d775c453-d84d-48b2-8966-57756eec2700` |
| Correlation id | `09675879-36ef-4cb1-be08-bffcbde4d1ff` |
| Timestamp (UTC) | 2026-08-17T18:16:45.593Z |
| Device platform | macOS |
| Device state | Unregistered |

Folder link:
https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/Worldpay/WP%20Weekly%20Reports?d=w23de4595d91f489fa3c825c6b52e4fcd&csf=1&web=1&e=uSIZpB

Happy to jump on a quick call if that's faster.

Thanks,
Krishna Nagavolu
Payments / dashboard owner
