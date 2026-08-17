# Tech Help request — read-only SharePoint access for the Payments KPI dashboard automation

## Summary
A weekly automation needs to download two Worldpay Excel reports from one SharePoint
folder and refresh the Payments KPI dashboard. Interactive sign-in is currently blocked
by Conditional Access (error **AADSTS53003**).

## Blocked sign-in details

| Field | Value |
|---|---|
| Error code | **53003** (BlockedByConditionalAccess) |
| Message | "Your sign-in was successful but does not meet the criteria to access this resource." |
| App name attempted | Microsoft Azure CLI |
| App id | `04b07795-8ddb-461a-bbee-02f9e1bf7b46` |
| Request id | `d775c453-d84d-48b2-8966-57756eec2700` |
| Correlation id | `09675879-36ef-4cb1-be08-bffcbde4d1ff` |
| Timestamp (UTC) | 2026-08-17T18:16:45.593Z |
| Device platform | macOS |
| Device state | Unregistered |

The block appears to come from a device-compliance / approved-application policy. The
requester's account itself authenticated successfully.

## Folder needed (read-only)
- Site: `CoreShopTech`
- Path: `Shared Documents/General/Payment Systems/Reports/Worldpay/WP Weekly Reports`
- Link: https://dutchbros.sharepoint.com/:f:/r/sites/CoreShopTech/Shared%20Documents/General/Payment%20Systems/Reports/Worldpay/WP%20Weekly%20Reports?d=w23de4595d91f489fa3c825c6b52e4fcd&csf=1&web=1&e=uSIZpB
- Files: two `.xlsx` reports delivered weekly (Auth Summary, Interchange)

## Preferred resolution — service principal (no interactive sign-in)

An **Entra app registration** with application permissions, which avoids Conditional
Access entirely because no user or device is involved:

1. Create an app registration (suggested name: `Payments KPI Dashboard - Worldpay Reader`)
2. Grant **Microsoft Graph → `Sites.Selected`** (application permission) with admin consent
3. Scope it to **only** the CoreShopTech document library above, **read** role
4. Provide: **tenant id**, **client id**, and a **client secret** (or federated credential)

This is least privilege: read-only, one library, no user impersonation, no write or
delete, no access to any other SharePoint content.

## Alternative — allow interactive access
If a service principal is not permitted, either:
- Exclude an approved application from the device-compliance policy for this user, or
- Provide an IT-approved method to read that folder programmatically

## Access level requested
Read / download only. No write, delete, or sharing changes.

## Business context
The dashboard is refreshed weekly for payments leadership. Without automated access,
the two report files must be moved manually every week.

## Contact
Krishna Nagavolu — Payments / dashboard owner
