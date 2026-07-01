# Triangle Verification for Verifone Serial Numbers

This project creates an automated Excel report that checks Verifone device serial
numbers across three vendor systems:

- **PWC**: digital payment configuration
- **VHQ**: digital Verifone estate/configuration
- **iTrac**: physical devices shipped to shops

The output is a single Excel file named `mismatch_alert_report.xlsx`.

## Files in this folder

- `generate_mock_data.py` creates fake CSV files so you can test the process
  instantly before using real vendor exports.
- `triangle_verification_report.py` reads the three CSV files, applies the
  mismatch rules, and creates the Excel alert report.
- `requirements.txt` lists the lightweight Python packages needed to run the
  scripts.

## Expected input files

Place these three CSV files in this folder:

1. `pwc_report.csv`
   - Required fields: `NewCoID`, `Merchant_ID`, `Terminal_ID`,
     `Serial_Number`, `Status`
2. `vhq_report.csv`
   - Required fields: `NewCoID`, `Serial_Number`, `Hierarchy`, `Status`,
     `Last_Heartbeat`
3. `itrac_report.csv`
   - Required fields: `NewCoID`, `Shipped_Serial_Number`, `Shipping_Status`

## Exact commands to run

Copy and paste these commands into your terminal from this folder.

### 1. Install the required packages

```bash
python3 -m pip install --user -r requirements.txt
```

### 2. Create fake test CSV files

```bash
python3 generate_mock_data.py
```

### 3. Create the Excel mismatch report

```bash
python3 triangle_verification_report.py
```

The report will be created here:

```text
mismatch_alert_report.xlsx
```

## How to use real data

After the fake-data test works, replace these three files with your real vendor
exports:

- `pwc_report.csv`
- `vhq_report.csv`
- `itrac_report.csv`

Then run this command again:

```bash
python3 triangle_verification_report.py
```

## What the report checks

1. **Rule 1 - PWC vs VHQ Alignment**
   - Flags serial numbers that exist in PWC but not VHQ.
   - Flags serial numbers that exist in VHQ but not PWC.

2. **Rule 2 - Triangle Check**
   - Flags physical serial numbers shipped in iTrac that are not digitally mapped
     in PWC and/or VHQ.
   - These are marked as **Critical** because they can cause opening-day payment
     failures.

3. **Rule 3 - Status Check**
   - Flags PWC serial numbers whose status is not `Green/Active`.
   - Flags VHQ serial numbers whose status is `Inactive` or
     `Pending Registration`.
