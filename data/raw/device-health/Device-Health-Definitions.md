# Device Health: definitions and explainer

`[CURRENT AS OF: 2026-10-28]` · Data snapshot: VHQ and iTrac exports dated 2026-10-26 · Owner: Krishna Nagavolu (Shop Tech, Dutch Bros)

Read this before answering any question about the Device Health workbook (`Device_Health_YYYY-MM-DD.xlsx`) or about E285 counts. It is self-contained. It is not a `KB.md` update. Tags: `[CONFIRMED]` Krishna validated it, `[ASSUMED]` working hypothesis, `[TBD]` unknown, `[CONFLICT]` sources disagree. Do not resolve a `[TBD]` or `[CONFLICT]` by inference. If something is not here, say so and ask.

---

## 1. What the workbook answers

| Section | Question | Source |
|---|---|---|
| 1. Devices in VHQ | How many payment devices do we have, how many Active, how many Inactive? | VHQ device export |
| 2. E285 health | Of the E285s, how many are in shops and how many are at Stratix (spare pool, depot, awaiting NSO)? | VHQ + iTrac |
| 3. PO burn down | Of the 5,700-unit E285 purchase order, how many have shipped and how many remain? | Verifone burn down file |

The three sections use three different counting piles. Do not add them together and do not compare section 3 to sections 1 and 2.

---

## 2. Systems and terms

**E285** `[CONFIRMED]`: Verifone payment terminal in shops today (VHQ model strings start `e285-`). **E235** `[CONFIRMED]`: next device, Verifone, VHQ model `e235-4G-1`; currently planning and pilot, 4 appear in VHQ. E235 devices are counted in section 1 only, not section 2.

**VHQ** `[CONFIRMED]`: Verifone's terminal management system. Statuses in the export: `Active`, `Inactive`, `PendingRegistration`, `PendingHierarchyAssignment`. The workbook reports "Pending" as both pending statuses together.
- *Active* = the device is registered and in use. *Inactive* = registered, not active now. Inactive does not mean lost, broken, or unbilled. `[TBD]` what drives a device to Inactive and whether Verifone bills Inactive serials.
- *Hierarchy path* is where VHQ places the device: `Dutch Bros >> Corporate Shops | Franchisee Shops | Corporate 24-Hour Shops | Franchisee 24-Hour Shops >> State >> shop code`. Other values: `Dutch Bros` (root, not assigned), `Dutch Bros >> Life Cycle Management >> Untrusted Devices` (not a shop).
- Hierarchy can be stale. A device can be in a shop path while physically elsewhere.

**Stratix / iTrac** `[CONFIRMED]`: Stratix is the depot and logistics vendor; iTrac is its tool. `Assets at Stratix.csv` lists only devices Stratix holds. A device in a shop or in transit is not in that file. Statuses: In Inventory, In Repair, Picked, RMA Received. Task numbers used for the split:

| iTrac Task Number | Name in workbook | Meaning (Ken, Stratix, 10/29/2026) `[CONFIRMED by Stratix]` | In Stratix install base? |
|---|---|---|---|
| 1.1 SPARE POOL | Spare pool | Replacement stock for service orders (RMAs). The pool also counts devices in repair, picked, received, and devices due back and pending return after a replacement was sent. | Per the scorecard definition, yes `[ASSUMED]`. Ken did not say. |
| 2.1 CUST OWNED (Task name "Depot Devices") | Depot | Can move into the spare pool, add devices to shops, or ship to a new shop if its permanent devices arrive late. | No |
| 1.2 CUST OWNED | Awaiting NSO / deployment | Devices Verifone shipped for specific shops. Orders are placed from the NSO sheet. | No |
| 1.7 CUST OWNED (CA4505) | Held for pushed opening (CA4505) | Shipped to the shop on schedule; the opening was pushed. Held until 11/10, the current requested ship date. | Yes, a special case |

**Available vs not available.** Ken: iTrac numbers are live and change as items ship or are received. "Available to Order" is what Stratix can send out now. The task a device sits in decides how it can be used. The workbook uses iTrac status `In Inventory` as "available to ship" and `In Repair`, `Picked`, `RMA Received` as "not available". Ken's live "Available to Order" figures are a separate hand-typed table with its own date.

`[TBD]` what "customer owned" means for billing. The tag suggests Dutch Bros owns them; the contract says devices stay Verifone property. Verifone's rental term starts at shipment `[CONFIRMED earlier]`, so devices in 1.2 and 2.1 may be billed by Verifone even though they are outside the Stratix install base. Not verified.

**NSO** = new shop opening. Devices are shipped to a new shop before opening; shops are ordered when they publish in Portal.

**Burn down file** `[CONFIRMED]`: `Dutch Bro Burndown Chart.xlsx`, sent manually by Verifone, one tab per report date (`MM-DD-YYYY`). Fields: Original Amount, Qty Shipped Since Feb, Qty in Picked Status, Total Shipped / In Process, Backlog Qty, Remaining Balance, Forecasted Amount.

---

## 3. How each number is built

**Section 1.** One row per unique serial. Serials are compared ignoring dashes and case. If a serial appears more than once, keep Active, then Inactive, then PendingHierarchyAssignment, then PendingRegistration. 10/26 export: 17,862 rows, 11 duplicate rows removed, 17,851 devices.

**Section 2.** E285 universe = VHQ serials with model starting `e285` plus serials that are only in the Stratix file. Each serial is placed once, in this order:
1. At Stratix, if it is in `Assets at Stratix.csv` (split by Task Number above).
2. In a shop, if the VHQ hierarchy path is a Shops group. Reported as Active vs Inactive / pending.
3. Location not confirmed, for everything else.

Stratix wins when a serial is both in a shop path and in the Stratix file (320 on 10/26, counted once, at Stratix). "Location not confirmed" is a label meaning neither file shows a location. It is not a finding that the device is lost or missing.

**Section 3.** Straight from the latest tab of Verifone's file. The Burn down tab plots every tab. The file is manual: check the tab date before quoting.

---

## 4. Snapshot (VHQ and iTrac 10/26/2026; burn down tab 10/01/2026)

| | Devices |
|---|---|
| VHQ total / Active / Inactive / Pending | 17,851 / 9,061 / 8,722 / 68 |
| E285 in the system | 18,085 |
| In shops (Active / Inactive or pending) | 13,114 (8,987 / 4,127) |
| At Stratix | 3,202 (Spare pool 1,774 · Depot 347 · Awaiting NSO 1,072 · Held for pushed opening 9) |
| Location not confirmed | 1,769 |
| PO: original / shipped / picked / remaining | 5,700 / 1,930 / 120 / 3,650 |

At Stratix, available vs not available (iTrac export 10/26):

| Bucket | Total | Available (In Inventory) | Not available | In Repair | Picked | RMA Received |
|---|---|---|---|---|---|---|
| Spare pool | 1,774 | 401 | 1,373 | 1,273 | 87 | 13 |
| Depot | 347 | 335 | 12 | 1 | 11 | 0 |
| Awaiting NSO | 1,072 | 955 | 117 | 15 | 102 | 0 |
| Held for pushed opening | 9 | 9 | 0 | 0 | 0 | 0 |
| **Total** | **3,202** | **1,700** | **1,502** | **1,289** | **200** | **13** |

Of the 1,273 spare pool devices In Repair: 719 are Return to OEM and 503 are Repair In Process. Stratix's own live view on 10/29 showed "Available to Order" of 452 (spare pool), 899 (1.2), 9 (1.7) and 332 (depot), 1,692 in total. The difference from the table above is timing.

---

## 5. Do not conclude

- Active + Inactive is not what we pay for. Billing is not in these files. `[TBD]`
- Inactive in a shop path is not "missing"; it may be switched off in a shop. Inactive with no shop path is not proven lost either. Both need the vendor.
- The PO (5,700 units, 10 per shop, from 1 Feb 2026) is a separate pile from the VHQ device count.
- Stratix's scorecard install base (16,494 on 10/27, a running total of Verifone shipments that is never reduced) is not the workbook's E285 count. Do not reconcile them without saying so.

## 6. Open conflicts

- `[CONFLICT]` Remaining E285 balance: Krishna's chart 3,250, Verifone's burn down tab 3,650, Dennis (Verifone) about 3,650, another source 3,600. Unreconciled.
- `[CONFIRMED by Stratix 10/29]` Depot devices (2.1) and 1.2 devices are not in the Stratix install base; only 1.7 is. This resolves the earlier conflict (10/19 note said depot was included).
- `[TBD]` Whether the spare pool (1,774, including 1,273 in repair) is inside the install base. The scorecard definition says "Spare Pool" is; Ken did not answer.
- `[TBD]` Ken says the spare pool also counts devices "due back and pending return". The iTrac export only has In Inventory, In Repair, Picked and RMA Received. Unclear whether due-back devices are in the export or counted elsewhere.
- `[TBD]` Whether any E285 was removed from the Stratix install base for lost/stolen or replaced devices (Removals tab requested in the 10/27 email draft to Stratix; not confirmed sent).
- `[ASSUMED]` The Verifone burn down is the PO balance Dutch Bros should use; its latest tab is 10/01.

## 7. Where things live

- Workbook, source files, and this file: `Downloads/Reports/Device health/`
- Script: `tools/device-health/build_device_health.py`; skill: `.cursor/skills/device-health-extract/SKILL.md`
- Related context: `lab/E235-CONTEXT.md`, `nso/payment-terminal-context.md`
- Refresh: drop the new VHQ and iTrac exports (and Verifone's burn down file) in the Device health folder and run the script. Download click paths: `[TBD]`.
